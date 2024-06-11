import {stringToBase64} from 'uint8array-extras';

const filePickerOptions: FilePickerOptions = {
	types: [
		{
			accept: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'application/json': '.json',
			},
		},
	],
};

const isModern = typeof showOpenFilePicker === 'function';

async function loadFileOld(): Promise<string> {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	const eventPromise = new Promise<Event>(resolve => {
		input.addEventListener('change', resolve, {once: true});
	});

	input.click();
	const event = await eventPromise;
	const file = (event.target as HTMLInputElement).files![0];
	if (!file) {
		throw new Error('No file selected');
	}

	return file.text();
}

async function saveFileOld(text: string, suggestedName: string): Promise<void> {
	// Use data URL because Safari doesn't support saving blob URLs
	// Use base64 or else linebreaks are lost
	const url = `data:application/json;base64,${stringToBase64(text)}`;
	const link = document.createElement('a');
	link.download = suggestedName;
	link.href = url;
	link.click();
}

async function loadFileModern(): Promise<string> {
	const [fileHandle] = await showOpenFilePicker(filePickerOptions);
	const file = await fileHandle.getFile();
	return file.text();
}

async function saveFileModern(text: string, suggestedName: string) {
	const fileHandle = await showSaveFilePicker({
		...filePickerOptions,
		suggestedName,
	});

	const writable = await fileHandle.createWritable();
	await writable.write(text);
	await writable.close();
}

export const loadFile = isModern ? loadFileModern : loadFileOld;
export const saveFile = isModern ? saveFileModern : saveFileOld;
