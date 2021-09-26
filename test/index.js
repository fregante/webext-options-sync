import './_fixtures.js';
import test from 'ava';
import lzString from 'lz-string';
import OptionsSync from '../index.js';

OptionsSync.prototype._log = () => {};

function flattenInstance(setup) {
	return JSON.parse(JSON.stringify(setup));
}

function compressOptions(options) {
	return lzString.compressToEncodedURIComponent(JSON.stringify(options));
}

const defaultSetup = {
	_migrations: {},
	defaults: {},
	storageName: 'options',
};

const simpleSetup = {
	_migrations: {},
	defaults: {
		color: 'red',
		sound: true,
	},
	storageName: 'settings',
};

test.beforeEach(() => {
	chrome.flush();
	chrome.storage.sync.set.yields(undefined);
	chrome.management.getSelf.yields({
		installType: 'development',
	});
});

test.serial('basic usage', t => {
	t.deepEqual(flattenInstance(new OptionsSync()), defaultSetup);
	t.deepEqual(flattenInstance(new OptionsSync(simpleSetup)), simpleSetup);
});

test.serial('getAll returns empty object when storage is empty', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({});

	const storage = new OptionsSync();
	t.deepEqual(await storage.getAll(), {});
});

test.serial('getAll returns defaults when storage is empty', async t => {
	chrome.storage.sync.get
		.withArgs('settings')
		.yields({});

	const storage = new OptionsSync(simpleSetup);
	t.deepEqual(await storage.getAll(), simpleSetup.defaults);
});

test.serial('getAll returns saved options', async t => {
	const previouslySavedOptions = {
		color: 'fucsia',
		people: 3,
	};

	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: compressOptions(previouslySavedOptions)});

	const storage = new OptionsSync();
	t.deepEqual(await storage.getAll(), previouslySavedOptions);
});

test.serial('getAll returns saved legacy options', async t => {
	const previouslySavedOptions = {
		color: 'fucsia',
		people: 3,
	};

	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: previouslySavedOptions});

	const storage = new OptionsSync();
	t.deepEqual(await storage.getAll(), previouslySavedOptions);
});

test.serial('getAll merges saved options with defaults', async t => {
	const previouslySavedOptions = {
		color: 'fucsia',
		people: 3,
	};

	chrome.storage.sync.get
		.withArgs('settings')
		.yields({settings: compressOptions(previouslySavedOptions)});

	const storage = new OptionsSync(simpleSetup);
	t.deepEqual(await storage.getAll(), {
		color: 'fucsia',
		people: 3,
		sound: true,
	});
});

test.serial('setAll', async t => {
	const newOptions = {
		name: 'Rico',
		people: 3,
	};

	const storage = new OptionsSync();
	await storage.setAll(newOptions);
	t.true(chrome.storage.sync.set.calledOnce);
	t.deepEqual(chrome.storage.sync.set.firstCall.args[0], {
		options: compressOptions(newOptions),
	});
});

test.serial('setAll skips defaults', async t => {
	const newOptions = {
		name: 'Rico',
		people: 3,
	};

	const storage = new OptionsSync(simpleSetup);
	await storage.setAll({...newOptions, sound: true});
	t.true(chrome.storage.sync.set.calledOnce);
	t.deepEqual(chrome.storage.sync.set.firstCall.args[0], {
		settings: compressOptions(newOptions),
	});
});

test.serial('set merges with existing data', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: {size: 30}});

	const storage = new OptionsSync();
	await storage.set({sound: false});
	t.is(chrome.storage.sync.set.callCount, 1);
	t.deepEqual(chrome.storage.sync.set.firstCall.args[0], {
		options: compressOptions({
			size: 30,
			sound: false,
		}),
	});
});

test.serial('migrations alter the stored options', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: {size: 30}});

	const storage = new OptionsSync({
		migrations: [
			savedOptions => {
				if (typeof savedOptions.size !== 'undefined') {
					savedOptions.minSize = savedOptions.size;
					delete savedOptions.size;
				}
			},
		],
	});

	await storage._migrations;

	t.is(chrome.storage.sync.set.callCount, 1);
	t.deepEqual(chrome.storage.sync.set.firstCall.args[0], {
		options: compressOptions({
			minSize: 30,
		}),
	});
});

test.serial('migrations shouldn’t trigger updates if they don’t change anything', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({});

	const storage = new OptionsSync({
		migrations: [
			() => {},
		],
	});

	await storage._migrations;

	t.true(chrome.storage.sync.set.notCalled);
});

test.serial('migrations are completed before future get/set operations', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({});

	const storage = new OptionsSync({
		migrations: [
			savedOptions => {
				savedOptions.foo = 'bar';
				chrome.storage.sync.get
					.withArgs('options')
					.yields({
						options: {
							foo: 'bar',
						},
					});
			},
		],
	});

	t.deepEqual(await storage.getAll(), {
		foo: 'bar',
	});
});

test.serial('removeUnused migration works', async t => {
	chrome.storage.sync.get
		.withArgs('settings')
		.yields({
			settings: {
				size: 30, // Unused
				sound: false, // Non-default
			},
		});

	const storage = new OptionsSync(simpleSetup);
	await storage._runMigrations([
		OptionsSync.migrations.removeUnused,
	]);

	t.is(chrome.storage.sync.set.callCount, 1);
	t.deepEqual(chrome.storage.sync.set.firstCall.args[0], {
		settings: compressOptions({
			sound: false,
		}),
	});
});

test.todo('form syncing');
