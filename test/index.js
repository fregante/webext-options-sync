import './_fixtures';
import test from 'ava';
import OptionsSync from '..';

function flattenInstance(setup) {
	return JSON.parse(JSON.stringify(setup));
}

const defaultSetup = {
	defaults: {},
	storageName: 'options'
};

const simpleSetup = {
	defaults: {
		color: 'red',
		sound: true
	},
	storageName: 'settings'
};

test.beforeEach(() => {
	chrome.flush();
	chrome.storage.sync.set.yields(undefined);
});

test('basic usage', t => {
	t.deepEqual(flattenInstance(new OptionsSync()), defaultSetup);
	t.deepEqual(flattenInstance(new OptionsSync(simpleSetup)), simpleSetup);
});

test('getAll returns empty object when storage is empty', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({});

	const storage = new OptionsSync();
	t.deepEqual(await storage.getAll(), {});
});

test('getAll returns defaults when storage is empty', async t => {
	chrome.storage.sync.get
		.withArgs('settings')
		.yields({});

	const storage = new OptionsSync(simpleSetup);
	t.deepEqual(await storage.getAll(), simpleSetup.defaults);
});

test('getAll returns saved options', async t => {
	const previouslySavedOptions = {
		color: 'fucsia',
		people: 3
	};

	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: previouslySavedOptions});

	const storage = new OptionsSync();
	t.deepEqual(await storage.getAll(), previouslySavedOptions);
});

test('getAll merges saved options with defaults', async t => {
	const previouslySavedOptions = {
		color: 'fucsia',
		people: 3
	};

	chrome.storage.sync.get
		.withArgs('settings')
		.yields({settings: previouslySavedOptions});

	const storage = new OptionsSync(simpleSetup);
	t.deepEqual(await storage.getAll(), {
		color: 'fucsia',
		people: 3,
		sound: true
	});
});

test('setAll', async t => {
	const newOptions = {
		name: 'Rico',
		people: 3
	};

	const storage = new OptionsSync();
	await storage.setAll(newOptions);
	t.true(chrome.storage.sync.set.withArgs({
		options: newOptions
	}).calledOnce);
});

test('setAll skips defaults', async t => {
	const newOptions = {
		name: 'Rico',
		people: 3
	};

	const storage = new OptionsSync(simpleSetup);
	await storage.setAll({...newOptions, sound: true});
	t.true(chrome.storage.sync.set.withArgs({
		options: newOptions
	}).calledOnce);
});

test('set merges with existing data', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: {size: 30}});

	const storage = new OptionsSync();
	await storage.set({sound: false});
	t.true(chrome.storage.sync.set.withArgs({
		options: {
			size: 30,
			sound: false
		}
	}).calledOnce);
});

test('migrations alter the stored options', async t => {
	chrome.storage.sync.get
		.withArgs('options')
		.yields({options: {size: 30}});

	const storage = new OptionsSync();
	await storage._runMigrations([
		savedOptions => {
			if (typeof savedOptions.size !== 'undefined') {
				savedOptions.minSize = savedOptions.size;
				delete savedOptions.size;
			}
		}
	]);
	console.log('fuck you')

	t.deepEqual(chrome.storage.sync.set.getCalls()[0].args[0], {
		options: {
			minSize: 30
		}
	});
});

