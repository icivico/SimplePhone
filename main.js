/**
 * Copyright (c) 2012 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 **/


/**
 * Listens for the app launching then creates the window
 *
 * @see http://developer.chrome.com/trunk/apps/app.window.html
 */
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('phone.html', {
    bounds: {
      width: 240,
      height: 340
    },
    maxWidth: 240,
    minWidth: 240,
    minHeight: 340,
    maxHeight: 340
  });
});
