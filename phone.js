var config = null;
var sipStack = null;
var active_call = null;
var registered = false;
var callStart = 0;

/**
 * Initialize sip stack
 */
function createSipStack() {
	var configuration = {
  		uri: config.user,
		password: config.pass,
		ws_servers: config.url,
		display_name: 'test',
		no_answer_timeout: 20,
		register: true,
		trace_sip: true
	};

	console.info("Create SIP stack...");
	sipStack = new JsSIP.UA(configuration);
	sipStack.on('connected', function(e){ console.debug("Connected to websocket."); });
	sipStack.on('disconnected', function(e){ console.debug("Disconnected from websocket"); });
	sipStack.on('newMessage', function(e) {
		e.data.message.accept();
	});
	sipStack.on('newRTCSession', function(e) {
		console.debug("New session created");
		if(active_call === null) {
			// new incoming call
			active_call = e.data.session;
			active_call.on('failed', function(e) {
				console.warn('Call failed');
				active_call = null;
				setTimeout(function() { moveUIToState('phone'); }, 1500);
				chrome.notifications.clear("ring", function() {});
			});
			active_call.on('started', function(e) {
				console.info("Call started");
				callStart = new Date().getTime();
				chrome.notifications.clear("ring", function() {});
				if ( active_call.getLocalStreams().length > 0) {
				    	console.debug('Have local stream');
					var selfView = document.getElementById('selfView');
					selfView.src = window.URL.createObjectURL(active_call.getLocalStreams()[0]);
					selfView.volume = 0;
				} else {
				    	console.warn('No local stream!');
				} 
				if ( active_call.getRemoteStreams().length > 0) {
					console.debug('Start remote audio stream');
					var remoteView = document.getElementById('remoteView');
					remoteView.src = window.URL.createObjectURL(active_call.getRemoteStreams()[0]);
				}
				moveUIToState('incall');
				
			});
			active_call.on('ended', function(e) {
				console.debug("Call terminated");
				moveUIToState('phone');
				active_call = null;	
				chrome.notifications.clear("ring", function() {});
			});
			
			// ui
			if(e.data.session.direction === 'incoming') {
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
	sipStack.on('registered', 
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
								setTimeout(function() { chrome.notifications.clear("reg", function() {}); }, 5000);
							}
					);
				}
			}
	);
	sipStack.on('unregistered', function(e){ console.debug("Unregistered."); });
	sipStack.on('registrationFailed', function(e){ console.debug("Registration failed."); });
	
	console.info("Starting stack ...");
	sipStack.start();
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
		m=padZero(m);
		s=padZero(s);
		var chr = m+":"+s;
		$('#incall div.tools').html('In a call <span style="float: right; font-size: 0.9em;">'+ chr +'</span>');
		setTimeout(function(){chrono()},500);
	}
}

function padZero(i) {
	if (i < 10) {
	  i="0" + i;
	}
	return i;
}

function accept() {
	if (active_call !== null) {
		active_call.answer({mediaConstraints: {audio: true, video: true}});
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
	$('#dialbtn').click(function() {
		if(active_call === null) {
			console.debug("New call to " + $('#display').val());
			var eventHandlers = {};
			var options = {
				'eventHandlers': eventHandlers,
				'mediaConstraints': {audio: true, video: true}
			};
			sipStack.call($('#display').val(), options);
 		} else {
			console.debug("Hangup active call");
			active_call.terminate();
		}
	});
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
	if(active_call !== null) active_call.terminate();

	if(sipStack !== null)
		sipStack.stop();
});
