import { DEFAULT_CHATGPT_MATCH_PATTERNS } from './constants.js';
import {
	queryChatGptTab,
	requestChatGptStatus,
	requestChatGptConvert,
} from './chatgpt.js';

export const setupCalendarButton = (button, chatGptConfig) => {
	if (!button) {
		return;
	}

	const matchPatterns = chatGptConfig?.matchPatterns ?? DEFAULT_CHATGPT_MATCH_PATTERNS;
	button.classList.add('is-hidden');

	const setButtonState = (state) => {
		if (state === 'hidden') {
			button.classList.add('is-hidden');
			button.disabled = true;
			return;
		}
		button.classList.remove('is-hidden');
		button.disabled = state === 'disabled';
	};

	const refresh = async () => {
		const tab = await queryChatGptTab(matchPatterns);
		if (!tab?.id) {
			setButtonState('hidden');
			return;
		}

		const status = await requestChatGptStatus(tab.id);
		if (!status?.ok) {
			setButtonState('hidden');
			return;
		}

		setButtonState(status.hasCodeBlock ? 'enabled' : 'disabled');
	};

	button.addEventListener('click', async () => {
		const tab = await queryChatGptTab(matchPatterns);
		if (!tab?.id) {
			setButtonState('hidden');
			return;
		}

		const result = await requestChatGptConvert(tab.id);
		if (!result?.ok) {
			button.textContent = '失敗';
			setTimeout(() => { button.textContent = 'GCal追加'; }, 1200);
		}
	});

	refresh();
	setInterval(refresh, 2000);
};
