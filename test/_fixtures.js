import chrome from 'sinon-chrome';

global.location = new URL('chrome://1234/_generated_background_page.html');
global.chrome = chrome;
