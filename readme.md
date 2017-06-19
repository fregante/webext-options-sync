# webext-options-sync

> Helps you manage and autosave your extension's options.

[![Travis build status](https://api.travis-ci.org/bfred-it/webext-options-sync.svg?branch=master)](https://travis-ci.org/bfred-it/webext-options-sync)
[![npm version](https://img.shields.io/npm/v/webext-options-sync.svg)](https://www.npmjs.com/package/webext-options-sync)

Main features:

* Define your default options
* Add autoload and autosave to your options `<form>`
* Run migrations on update

## Install

```sh
npm install --save webext-options-sync
```

If you're using a bundler:

```js
import OptionsSync from 'webext-options-sync';
```

## Usage

### Options access

Access your saved options from `content.js` or `background.js` with:

```js
/* globals OptionsSync */
new OptionsSync().getAll().then(options => {
	console.log('The user’s options are', options);
	if(options.color) {
		document.body.style.color = color;
	}
});
```

And don't forget to include `webext-options-sync` in your manifest.json:

```json
{
	"content_scripts": [
	    {
	        "matches": [
	            "https://www.google.com*",
	        ],
	        "js": [
	            "node_modules/webext-options-sync/index.js",
	            "content.js"
	        ]
	    }
	]
}
```

### Defaults definition

Create your options definition file, for example `options-init.js`:

```js
/* globals OptionsSync */
new OptionsSync().define({
	defaults: {
		yourStringOption: 'green',
		anyBooleans: true,
		numbersAreFine: 9001
		// Open an issue to discuss more complex fields like multiselects
	}
});
```

Include it in `manifest.json` as a background script together with `webext-options-sync`

```json
{
    "background": {
        "scripts": [
            "node_modules/webext-options-sync/index.js",
            "options-init.js"
        ]
    }
}
```

### Form autosave and autoload

`OptionsSync` listens to any field that triggers `input` or `change` events. Option names are set via the fields' `name` attribute. Checkboxes are stored as `true`/`false`; other fields are stored as strings.

In your `options.html` file, include `webext-options-sync/index.js` and then enable the sync this way:

```js
/* globals OptionsSync */
new OptionsSync().syncForm(document.querySelector('form#options-form'));
```

Done. Any defaults or saved options will be loaded into the form and any change will automatically be saved via `chrome.storage.sync`

### Migrations

In your `options-init.js` file, extend the call by including an array of functions, for example:

```js
/* globals OptionsSync */
new OptionsSync().define({
	defaults: {
		color: 'red',
	},
	migrations: [
		(savedOptions, currentDefaults) => {
			// perhaps it was renamed
			if(savedOptions.colour) {
				savedOptions.color = savedOptions.colour;
				delete savedOptions.colour;
			}
		},
		OptionsSync.migrations.removeUnused
	]
});
```

Notice `OptionsSync.migrations.removeUnused`: it's a helper method that removes any option that isn't defined in the defaults. It's useful to avoid leaving old options taking up space.

## API

#### const opts = new OptionsSync([storageName])

Returns an instance linked to the chosen storage. 

##### storageName

Type: `string`  
Default: `options`

The key used to store data in `chrome.storage.sync`

#### opts.define(setup)

To be used in the background only, this is used to initiate the options. It's not required but it's recommended as a way to define which options the extension supports.

##### setup

Type: `object`

It should follow this format:

```js
{
	defaults: { // recommended
		color: 'blue'
	}, 
	migrations: [ // optional
		savedOptions => {
			if(savedOptions.oldStuff) {
				delete savedOptions.oldStuff
			}
		}
	],
}
```

###### defaults

Type: `object`

A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.

###### migrations

Type: `array`

A list of functions to call when the extension is updated. The function will have this signature: `(savedOptions, defaults)`. In this function, alter the `savedOptions`. Don't return anything.

#### opts.getAll()

This returns a Promise that will resolve with **all** the options stored, as an object.

#### opts.setAll(options)

This will override **all** the options stored with your `options`

##### options

Type: `object`

A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.

#### opts.syncForm(form)

Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved via `chrome.storage.sync`

##### form

Type: `form dom element`

It's the `<form>` that needs to be synchronized. The form fields' `name` attributes will have to match the option names.

## Related

* [`webext-inject-on-install`](https://github.com/bfred-it/webext-inject-on-install): Automatically add content scripts to existing tabs when your extension is installed
* [`Awesome WebExtensions`](https://github.com/bfred-it/Awesome-WebExtensions): A curated list of awesome resources for Web Extensions development

## License

MIT © Federico Brigante — [Twitter](http://twitter.com/bfred_it)
