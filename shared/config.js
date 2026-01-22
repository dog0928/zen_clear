// Edit this file to customize endpoints and ChatGPT behavior.
(() => {
	const config = {
		zenStudy: {
			siteOrigin: 'https://www.nnn.ed.nico',
			apiOrigin: 'https://api.nnn.ed.nico',
		},
		chatgpt: {
			homeUrl: 'https://chatgpt.com/',
			matchPatterns: [
				'https://chatgpt.com/*',
				'https://chat.openai.com/*',
			],
			pathPrefix: '',
		},
	};

	globalThis.ZEN_CONFIG = config;
})();
