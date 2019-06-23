// https://github.com/bfred-it/webext-options-sync

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.OptionsSync = f()}})(function(){var define,module,exports;
var _$webextDetectPage_1 = {};
"use strict";
// https://github.com/bfred-it/webext-detect-page
Object.defineProperty(_$webextDetectPage_1, "__esModule", { value: true });
function isBackgroundPage() {
    return location.pathname === '/_generated_background_page.html' &&
        !location.protocol.startsWith('http') &&
        Boolean(typeof chrome === 'object' && chrome.runtime);
}
_$webextDetectPage_1.isBackgroundPage = isBackgroundPage;
function isContentScript() {
    return location.protocol.startsWith('http') &&
        Boolean(typeof chrome === 'object' && chrome.runtime);
}
_$webextDetectPage_1.isContentScript = isContentScript;
function isOptionsPage() {
    if (typeof chrome !== 'object' || !chrome.runtime) {
        return false;
    }
    const { options_ui } = chrome.runtime.getManifest();
    if (typeof options_ui !== 'object' || typeof options_ui.page !== 'string') {
        return false;
    }
    const url = new URL(options_ui.page, location.origin);
    return url.pathname === location.pathname &&
        url.origin === location.origin;
}
_$webextDetectPage_1.isOptionsPage = isOptionsPage;
//# sourceMappingURL=index.js.map
"use strict";
/* removed: const _$webextDetectPage_1 = require("webext-detect-page"); */;
class OptionsSync {
    /**
    @constructor Returns an instance linked to the chosen storage.
    @param options - Configuration to determine where options are stored.
    */
    constructor(options) {
        const fullOptions = {
            storageName: 'options',
            // eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
            defaults: {},
            migrations: [],
            logging: true,
            ...options
        };
        this.storageName = fullOptions.storageName;
        this.defaults = fullOptions.defaults;
        if (fullOptions.logging === false) {
            this._log = () => { };
        }
        if (_$webextDetectPage_1.isBackgroundPage()) {
            chrome.runtime.onInstalled.addListener(() => this._applyDefinition(fullOptions));
        }
        this._handleFormUpdatesDebounced = this._handleFormUpdatesDebounced.bind(this);
    }
    _log(method, ...args) {
        console[method](...args);
    }
    async _applyDefinition(defs) {
        const options = { ...defs.defaults, ...await this.getAll() };
        this._log('group', 'Appling definitions');
        this._log('info', 'Current options:', options);
        if (defs.migrations && defs.migrations.length > 0) {
            this._log('info', 'Running', defs.migrations.length, 'migrations');
            defs.migrations.forEach(migrate => migrate(options, defs.defaults));
        }
        this._log('info', 'Migrated options:', options);
        this._log('groupEnd');
        this.setAll(options);
    }
    _parseNumbers(options) {
        for (const name of Object.keys(options)) {
            if (options[name] === String(Number(options[name]))) {
                options[name] = Number(options[name]);
            }
        }
        return options;
    }
    /**
    Retrieves all the options stored.

    @returns Promise that will resolve with **all** the options stored, as an object.

    @example

    new OptionsSync().getAll().then(options => {
        console.log('The user’s options are', options);
        if (options.color) {
            document.body.style.color = color;
        }
    });
    */
    getAll() {
        return new Promise(resolve => {
            chrome.storage.sync.get(this.storageName, keys => resolve(keys[this.storageName] || {}));
        }).then(this._parseNumbers);
    }
    /**
    Overrides **all** the options stored with your `options`.

    @param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
    */
    setAll(newOptions) {
        return new Promise(resolve => {
            chrome.storage.sync.set({
                [this.storageName]: newOptions
            }, resolve);
        });
    }
    /**
    Merges new options with the existing stored options.

    @param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
    */
    async set(newOptions) {
        const options = await this.getAll();
        this.setAll(Object.assign(options, newOptions));
    }
    /**
    Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved via `chrome.storage.sync`.

    @param selector - The `<form>` that needs to be synchronized or a CSS selector (one element).
    The form fields' `name` attributes will have to match the option names.
    */
    async syncForm(form) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }
        form.addEventListener('input', this._handleFormUpdatesDebounced);
        form.addEventListener('change', this._handleFormUpdatesDebounced);
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                for (const key of Object.keys(changes)) {
                    const { newValue } = changes[key];
                    if (key === this.storageName) {
                        this._applyToForm(newValue, form);
                        return;
                    }
                }
            }
        });
        this._applyToForm(await this.getAll(), form);
    }
    _applyToForm(options, form) {
        this._log('group', 'Updating form');
        for (const name of Object.keys(options)) {
            const els = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
            const [field] = els;
            if (field) {
                this._log('info', name, ':', options[name]);
                switch (field.type) {
                    case 'checkbox':
                        field.checked = options[name];
                        break;
                    case 'radio': {
                        const [selected] = [...els].filter(el => el.value === options[name]);
                        if (selected) {
                            selected.checked = true;
                        }
                        break;
                    }
                    default:
                        field.value = options[name];
                        break;
                }
                field.dispatchEvent(new InputEvent('input'));
            }
            else {
                this._log('warn', 'Stored option {', name, ':', options[name], '} was not found on the page');
            }
        }
        this._log('groupEnd');
    }
    _handleFormUpdatesDebounced(event) {
        if (this._timer) {
            clearTimeout(this._timer);
        }
        this._timer = setTimeout(() => {
            this._handleFormUpdates(event.currentTarget);
            this._timer = undefined;
        }, 100);
    }
    _handleFormUpdates(el) {
        const { name } = el;
        let { value } = el;
        if (!name || !el.validity.valid) {
            return;
        }
        switch (el.type) {
            case 'select-one':
                value = el.options[el.selectedIndex].value;
                break;
            case 'checkbox':
                value = el.checked;
                break;
            default: break;
        }
        this._log('info', 'Saving option', el.name, 'to', value);
        this.set({
            [name]: value
        });
    }
}
OptionsSync.migrations = {
    /**
    Helper method that removes any option that isn't defined in the defaults. It's useful to avoid leaving old options taking up space.
    */
    removeUnused(options, defaults) {
        for (const key of Object.keys(options)) {
            if (!(key in defaults)) {
                delete options[key];
            }
        }
    }
};
if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
    class OptionsSyncElement extends HTMLFormElement {
        constructor() {
            super();
            new OptionsSync({
                storageName: this.getAttribute('storageName') || undefined,
                logging: Boolean(this.getAttribute('logging')) // Boolean attribute, if it's there it's true
            }).syncForm(this);
        }
    }
    customElements.define('options-sync', OptionsSyncElement);
}
var _$OptionsSync_2 = OptionsSync;

return _$OptionsSync_2;

});

