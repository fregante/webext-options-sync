import chrome from 'sinon-chrome';

globalThis.location = {
	origin: 'chrome://abc',
	pathname: '/_generated_background_page.html',
};
globalThis.chrome = chrome;
