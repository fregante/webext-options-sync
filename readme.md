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

Or just include the file `webext-options-sync.js` in your `manifest.json`.

## Usage

### Options access

Access your saved options from `content.js` or `background.js` with:

<details>

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
	            "webext-options-sync.js",
	            "content.js"
	        ]
	    }
	]
}
```

</details>

### Defaults definition

Create your options definition file, for example `options-init.js`:

<details>

```js
/* globals OptionsSync */
new OptionsSync({
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
            "webext-options-sync.js",
            "options-init.js"
        ]
    }
}
```

</details>

### Form autosave and autoload

`OptionsSync` listens to any field that triggers `input` or `change` events. Option names are set via the fields' `name` attribute. Checkboxes are stored as `true`/`false`; other fields are stored as strings.

<details>

In your `options.html` file, include `webext-options-sync.js` and then enable the sync this way:

```js
/* globals OptionsSync */
new OptionsSync().syncForm(document.querySelector('form#options-form'));
```

Done. Any defaults or saved options will be loaded into the form and any change will automatically be saved via `chrome.storage.sync`

In alternative you can put your fields in a custom`<options-sync>` element instead of `<form>` and they'll be automatically synchronized. You can specify the `storageName` via attribute, like:

```html
<options-sync storageName="my-options">
    <input type="color" name="color">
</options-sync>
```

<strong>Warning:</strong> Custom Elements are only supported by Firefox 63+ (November 2018)

</details>

#### Input validation

If your form fields have any [validation attributes](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5/Constraint_validation#Validation-related_attributes) they will not be saved until they become valid.

<details>

Since autosave and validation is silent, you should inform the user of invalid fields, possibly via CSS by using the `:invalid` selector:

``` css
/* Style the element */
input:invalid {
	color: red;
	border: 1px solid red;
}

/* Or display a custom error message */
input:invalid ~ .error-message {
	display: block;
}
```

</details>

### Migrations

<details>

In your `options-init.js` file, extend the call by including an array of functions, for example:

```js
/* globals OptionsSync */
new OptionsSync({
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

</details>

## API

#### const optionsStorage = new OptionsSync([setup])

##### setup

Type: `object`

Optional. It should follow this format:

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

Returns an instance linked to the chosen storage.

###### defaults

Type: `object`

A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.

###### migrations

Type: `array`

A list of functions to run in the `background` when the extension is updated. Example:

```js
{
	migrations: [
		(savedOptions, defaults) => {
			// Change the `savedOptions`
			if(savedOptions.oldStuff) {
				delete savedOptions.oldStuff
			}

			// No return needed
		}
	],
}
		```

###### storageName

Type: `string`
Default: `'options'`

The key used to store data in `chrome.storage.sync`

###### logging

Type: `boolean`
Default: `true`

Whether info and warnings (on sync, updating form, etc.) should be logged to the console or not.

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

Type: `form dom element`, `string`

It's the `<form>` that needs to be synchronized or a CSS selector (one element). The form fields' `name` attributes will have to match the option names.

## Related

* [`webext-inject-on-install`](https://github.com/bfred-it/webext-inject-on-install): Automatically add content scripts to existing tabs when your extension is installed
* [`Awesome WebExtensions`](https://github.com/bfred-it/Awesome-WebExtensions): A curated list of awesome resources for Web Extensions development

## License

MIT © Federico Brigante — [Twitter](http://twitter.com/bfred_it)
