var config = null;
var ua = null;
var active_call = null;
var registered = false;
var callStart = 0;

JsSIP.debug.enable('JsSIP:*');

/**
 * Initialize sip stack
 */
function createSipStack() {
	
	var configuration = {
  		uri: 'sip:'+config.user,
		password: config.pass,
		ws_servers: config.url,
		no_answer_timeout: 20,
		session_timers: false,
		register: true,
		trace_sip: true,
		connection_recovery_max_interval: 30,
		connection_recovery_min_interval: 2
	};

	console.info("Create SIP stack with configuration: " + JSON.stringify(configuration));
	try {
		ua = new JsSIP.UA(configuration);
	} catch (e) {
		console.debug(e.toString());
	}
	
	ua.on('connected', function(e){ console.debug("Connected to websocket."); });
	ua.on('disconnected', function(e){ console.debug("Disconnected from websocket"); });
	ua.on('newMessage', function(e) {
		e.data.message.accept();
	});
	ua.on('newRTCSession', function(e) {
		console.debug("New session created");
		if(active_call === null && e.session !== undefined) {
			// new incoming call
			active_call = e.session;
			active_call.on('failed', function(e) {
				console.log('call failed with cause: '+ e.cause);
				active_call = null;
				setTimeout(function() { moveUIToState('phone'); }, 1500);
				chrome.notifications.clear("ring", function() {});
			});
			active_call.on('progress', function(e) {
				if (e.originator === 'remote') e.response.body = null;
			});
			active_call.on('confirmed', function(e) {
				console.log('call confirmed');
				callStart = new Date().getTime();
				chrome.notifications.clear("ring", function() {});
				//var selfView = document.getElementById('selfView');
				//var local_stream = active_call.connection.getLocalStreams()[0];

				// Attach video local stream to selfViewif ( active_call.getLocalStreams().length > 0) {
				//var selfView = document.getElementById('selfView');
				//selfView = JsSIP.rtcninja.attachMediaStream(selfView, local_stream);
				moveUIToState('incall');
			});
			active_call.on('addstream', function(e) {
				var stream = e.stream;
				console.log('remote stream added');
				// Attach remote stream to remoteView
				var remoteView = document.getElementById('remoteView');
				remoteView = JsSIP.rtcninja.attachMediaStream(remoteView, stream);
			});
			active_call.on('ended', function(e) {
				console.debug("Call terminated");
				moveUIToState('phone');
				active_call = null;	
				chrome.notifications.clear("ring", function() {});
			});
			active_call.on('reinvite', function(e) {
				console.log('call reinvited with request: '+ e.request);
			});
			// ui
			if(e.session.direction === 'incoming') {
				moveUIToState('incoming');
				// notification
				var opt = {
				 	type: "basic",
					title: "Incoming call",
					message: "" + active_call.remote_identity.display_name + " is calling you",
					iconUrl: "incoming.png",
					buttons: [{title: "Accept", iconUrl: '/answer.png'},{title: "Reject", iconUrl: '/reject.png'}]
				};
				chrome.notifications.create("ring", opt, function() {});

			} else {
				moveUIToState('calling');
				$('#display').val('');
			}

		} else {
			e.data.session.terminate({status_code: 486});
		}
	});
	ua.on('registered', 
			function(e) {
				console.debug("Registered.");
				if(!registered) {
					registered = true;
					var opt = {
					 	type: "basic",
						title: "Registered",
						message: "Ready to receive calls",
						iconUrl: "registered.png"
					};
					chrome.notifications.create("reg", opt, 
							function() {
								setTimeout(function() { chrome.notifications.clear("reg", function() {}); }, 3000);
							}
					);
				}
			}
	);
	ua.on('unregistered', function(e){ console.debug("Unregistered."); });
	ua.on('registrationFailed', function(e){ console.debug("Registration failed."); });
	
	console.info("Starting stack ...");
	ua.start();
}

function moveUIToState(panel) {
	if (panel === 'phone') {
		// hide all
		$('#incoming').css('right', '240px');
		$('#incall').css('right', '240px');

	} else if (panel === 'incoming') {
		$('#incall').css('right', '240px');
		$('#incoming div.caller div.name').html(active_call.remote_identity.display_name);
		$('#incoming div.caller div.number').html(active_call.remote_identity.uri.toString());
		$('#incoming').animate({'right': '0px'}, 200);
	
	} else if (panel === 'calling') {
		$('#incoming').css('right', '240px');
		$('#incall div.tools').html('Calling to');
		$('#incall div.caller div.number').html($('#display').val());
		$('#incall div.buttons div#hangup').html('Cancel');
		$('#incall').animate({'right': '0px'}, 200);

	} else if (panel === 'incall') {
		$('#incoming').css('right', '240px');
		$('#incall div.tools').html('In a call');
		$('#incall div.caller div.name').html(active_call.remote_identity.display_name);
		$('#incall div.caller div.number').html(active_call.remote_identity.uri.toString());
		$('#incall div.buttons div#hangup').html('Hangup');
		$('#incall').animate({'right': '0px'}, 200);
		chrono();
	}
}

function chrono() {
	if(active_call !== null) {
		var ts = new Date().getTime() - callStart;
		var s = Math.floor(ts/1000);
		var m = Math.floor(s/60);
		var s = s - m*60;
		// add a zero in front of numbers<10
		m = padZero(m);
		s = padZero(s);
		var chr = m+":"+s;
		$('#incall div.tools').html('In a call <span style="float: right; font-size: 0.9em;">'+ chr +'</span>');
		setTimeout(function(){chrono()},500);
	}
}

function padZero(i) {
	if (i < 10)
	  i = "0" + i;
	return i;
}

function originate(videosupport) {
	if(active_call === null) {
		console.debug("New call to " + $('#display').val());
		var eventHandlers = {};
		
		var options = {
			'eventHandlers': eventHandlers,
			'mediaConstraints': {audio: true, video: videosupport}
		};
		
		active_call = ua.call($('#display').val(), options);
		
	} else {
		console.log("Hangup active call");
		active_call.terminate();
	}
}

function accept() {
	if (active_call !== null) {
		active_call.answer({mediaConstraints: {audio: true, video: false}});
	}
}

function hangup() {
	if (active_call !== null) {
		active_call.terminate();
	}
}

function reject() {
	if (active_call !== null) {
		active_call.terminate(486);
	}
}

$(document).ready(function() {
	console.info("Starting phone app ...");

	// UI configuration
	$('#dialbtn').click(function() { originate(false); });
	$('#dialbtn').mousedown(function() { 
		$('#dialbtn').removeClass('dial');
		$('#dialbtn').addClass('dial_pressed');
	});
	$('#dialbtn').mouseup(function() { 
		$('#dialbtn').removeClass('dial_pressed');
		$('#dialbtn').addClass('dial');
	});
	$('#dialbtn').mouseout(function() { 
		$('#dialbtn').removeClass('dial_pressed');
		$('#dialbtn').addClass('dial');
	});
	
	$('#videobtn').click(function() { originate(true); });
	$('#videobtn').mousedown(function() { 
		$('#videobtn').removeClass('dial');
		$('#videobtn').addClass('dial_pressed');
	});
	$('#videobtn').mouseup(function() { 
		$('#videobtn').removeClass('dial_pressed');
		$('#videobtn').addClass('dial');
	});
	$('#videobtn').mouseout(function() { 
		$('#videobtn').removeClass('dial_pressed');
		$('#videobtn').addClass('dial');
	});

	$('#hangup').mousedown(function() { 
		$('#hangup').removeClass('hangup');
		$('#hangup').addClass('hangup_pressed');
	});
	$('#hangup').mouseup(function() { 
		$('#hangup').removeClass('hangup_pressed');
		$('#hangup').addClass('hangup');
	});
	$('#hangup').mouseout(function() { 
		$('#hangup').removeClass('hangup_pressed');
		$('#hangup').addClass('hangup');
	});

	$('#backbtn').click(function() {
		var display = $('#display').val();
		$('#display').val(display.substr(0, display.length-1));
	});

	$('#savebtn').click(function() {
		console.debug('Save settings ...');
		chrome.storage.sync.set(
			{'url':$('#url').val(),'user':$('#user').val(),'pass':$('#pass').val()},
			function() { 
				console.debug('Settings succesfully saved.');
				$('#settings').css('top', '360px');
			}
		);
	});

	$('#cancelbtn').click(function() {
		console.debug('Cancel settings ...');
		$('#settings').animate({ top: "360px" }, 200);
	});

	$('#settingsbtn').click(function() {
		console.debug('Show settings ...');
		$('#settings').animate({ top: "0px" }, 200);
	});

	$('#accept').click(accept);

	$('#reject').click(reject);

	$('#hangup').click(hangup);

	$('#phone_dialpad table tr td').click(function(e) {
		console.debug("Pressed key " + $(e.currentTarget).html());
		var display = $('#display').val();
		$('#display').val(display + $(e.currentTarget).html());
	});

	// load configuration
	console.info("Loading shared config ...");
	chrome.storage.sync.get(null, 
		function(items) { 
			console.debug("Config loaded: " + JSON.stringify(items));
			config = items;
			if(config.url)
				$('#url').val(config.url);
			if(config.user)
				$('#user').val(config.user);
			if(config.pass)
				$('#pass').val(config.pass);
			
			createSipStack();
		}
	);

	// notifications
	chrome.notifications.onButtonClicked.addListener(function(id, btnidx) {
		if (id === 'ring') {
			if (btnidx === 0) accept();
			else if (btnidx === 1) reject();
		}
	});
});

$(document).unload(function() {
	console.info("Unload application");
	
	if(active_call !== null) 
		active_call.terminate();
	
	if(ua !== null) {
		ua.unregister();
		ua.stop();
	}
});
