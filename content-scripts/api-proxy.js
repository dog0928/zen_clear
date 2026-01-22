const DEFAULT_API_ORIGIN = 'https://api.nnn.ed.nico';

const getApiOrigin = () => {
	const origin = globalThis.ZEN_CONFIG?.zenStudy?.apiOrigin;
	if (typeof origin === 'string' && origin.trim()) {
		return origin.replace(/\/$/, '');
	}
	return DEFAULT_API_ORIGIN;
};

const callApiFromPage = async (path) => {
	const url = new URL(path, getApiOrigin());

	const response = await fetch(url, {
		credentials: 'include',
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
		},
	});

	if (!response.ok) {
		const error = new Error(`Request to ${url.pathname} failed with status ${response.status}`);
		error.status = response.status;
		throw error;
	}

	if (response.status === 204) {
		return null;
	}

	try {
		return await response.clone().json();
	} catch {
		const text = await response.text();
		return text ? JSON.parse(text) : null;
	}
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== 'ZEN_FETCH_API') {
		return;
	}

	(async () => {
		try {
			const data = await callApiFromPage(message.path);
			sendResponse({ ok: true, data });
		} catch (error) {
			sendResponse({
				ok: false,
				message: error.message,
				status: error.status ?? null,
			});
		}
	})();

	return true;
});
