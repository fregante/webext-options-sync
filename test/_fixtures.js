import chrome from 'sinon-chrome';

global.location = {
	origin: 'chrome://abc',
	pathname: '/_generated_background_page.html',
};
global.chrome = chrome;
