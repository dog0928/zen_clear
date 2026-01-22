// Edit this file to customize endpoints and ChatGPT behavior.
(() => {
	const config = {
		zenStudy: {
			siteOrigin: 'https://www.nnn.ed.nico',
			apiOrigin: 'https://api.nnn.ed.nico',
		},
		chatgpt: {
			homeUrl: 'https://chatgpt.com/g/g-691eb70e32908191aa41fc2cdc08a7df-rehotosukesiyuruzuo-cheng',
			matchPatterns: [
				'https://chatgpt.com/*',
				'https://chat.openai.com/*',
			],
			pathPrefix: '',
		},
	};

	globalThis.ZEN_CONFIG = config;
})();
