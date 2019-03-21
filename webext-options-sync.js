// https://github.com/bfred-it/webext-options-sync

class OptionsSync {
	constructor(options = {}) {
		this.storageName = options.storageName || 'options';
		if (options.logging === false) {
			this._log = () => {};
		}
	}

	_log(method, ...args) {
		console[method](...args);
	}

	define(defs) {
		defs = Object.assign({
			defaults: {},
			migrations: [],
		}, defs);

		if (chrome.runtime.onInstalled) { // In background script
			chrome.runtime.onInstalled.addListener(() => this._applyDefinition(defs));
		} else { // In content script, discouraged
			this._applyDefinition(defs);
		}
	}

	async _applyDefinition(defs) {
		const options = Object.assign({}, defs.defaults, await this.getAll());

		this._log('group', 'Appling definitions');
		this._log('info', 'Current options:', options);
		if (defs.migrations.length > 0) {
			this._log('info', 'Running', defs.migrations.length, 'migrations');
			defs.migrations.forEach(migrate => migrate(options, defs.defaults));
		}

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

	getAll() {
		return new Promise(resolve => {
			chrome.storage.sync.get(this.storageName,
				keys => resolve(keys[this.storageName] || {})
			);
		}).then(this._parseNumbers);
	}

	setAll(newOptions) {
		return new Promise(resolve => {
			chrome.storage.sync.set({
				[this.storageName]: newOptions,
			}, resolve);
		});
	}

	async set(newOptions) {
		const options = await this.getAll();
		this.setAll(Object.assign(options, newOptions));
	}

	syncForm(form) {
		if (typeof form === 'string') {
			form = document.querySelector(form);
		}

		this.getAll().then(options => this._applyToForm(options, form));
		form.addEventListener('input', e => this._handleFormUpdatesDebounced(e));
		form.addEventListener('change', e => this._handleFormUpdatesDebounced(e));
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === 'sync') {
				for (const key of Object.keys(changes)) {
					const {newValue} = changes[key];
					if (key === this.storageName) {
						this._applyToForm(newValue, form);
						return;
					}
				}
			}
		});
	}

	_applyToForm(options, form) {
		this._log('group', 'Updating form');
		for (const name of Object.keys(options)) {
			const els = form.querySelectorAll(`[name="${name}"]`);
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
			} else {
				this._log('warn', 'Stored option {', name, ':', options[name], '} was not found on the page');
			}
		}

		this._log('groupEnd');
	}

	_handleFormUpdatesDebounced({target: el}) {
		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			this._handleFormUpdates(el);
			this.timer = undefined;
		}, 100);
	}

	_handleFormUpdates(el) {
		const {name} = el;
		let {value} = el;
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
			[name]: value,
		});
	}
}

OptionsSync.migrations = {
	removeUnused(options, defaults) {
		for (const key of Object.keys(options)) {
			if (!(key in defaults)) {
				delete options[key];
			}
		}
	}
};

if (typeof HTMLElement !== 'undefined') {
	class OptionsSyncElement extends HTMLElement {
		constructor() {
			super();
			new OptionsSync(this.getAttribute('storageName') || undefined).syncForm(this);
		}
	}
	try {
		customElements.define('options-sync', OptionsSyncElement);
	} catch (error) {/* */}
}

if (typeof module === 'object') {
	module.exports = OptionsSync;
}
