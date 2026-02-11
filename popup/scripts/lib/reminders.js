import { REMINDER_STORAGE_KEY } from './constants.js';

const getStoredReminders = () => new Promise((resolve) => {
	if (!chrome?.storage?.local) {
		resolve([]);
		return;
	}

	chrome.storage.local.get(REMINDER_STORAGE_KEY, (data) => {
		const reminders = Array.isArray(data?.[REMINDER_STORAGE_KEY])
			? data[REMINDER_STORAGE_KEY]
			: [];
		resolve(reminders);
	});
});

const sendReminderCompletion = (id, completed) => new Promise((resolve) => {
	if (!chrome?.runtime?.sendMessage) {
		resolve({ ok: false });
		return;
	}

	chrome.runtime.sendMessage(
		{ type: 'ZEN_REMINDER_COMPLETE', id, completed },
		(response) => {
			if (chrome.runtime.lastError) {
				resolve({ ok: false });
				return;
			}
			resolve(response ?? { ok: false });
		},
	);
});

const formatReminderDateTime = (value, hasTime) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return '--/--';
	}

	const month = date.getMonth() + 1;
	const day = date.getDate();
	if (!hasTime) {
		return `${month}/${day}`;
	}

	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${month}/${day} ${hours}:${minutes}`;
};

const formatReminderMeta = (reminder) => {
	const dueText = formatReminderDateTime(reminder.startAt, reminder.hasTime);
	if (reminder.reminderAt) {
		const reminderText = formatReminderDateTime(reminder.reminderAt, reminder.hasTime);
		return `${dueText} | 通知 ${reminderText}`;
	}
	return dueText;
};

const createReminderRow = (reminder) => {
	const row = document.createElement('div');
	row.className = 'reminder-overlay__row';
	if (reminder.completed) {
		row.classList.add('is-completed');
	}

	const main = document.createElement('div');
	main.className = 'reminder-overlay__main';

	const title = document.createElement('strong');
	title.textContent = reminder.title || '予定';

	const meta = document.createElement('span');
	meta.className = 'reminder-overlay__meta';
	meta.textContent = formatReminderMeta(reminder);

	main.append(title, meta);

	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'reminder-overlay__check';
	button.dataset.reminderId = reminder.id;
	button.dataset.reminderCompleted = reminder.completed ? 'true' : 'false';
	button.textContent = reminder.completed ? '完了済み' : '完了';

	row.append(main, button);
	return row;
};

const renderReminderList = (listElement, summaryElement, reminders) => {
	if (!listElement || !summaryElement) {
		return;
	}

	listElement.innerHTML = '';

	const pendingReminders = reminders.filter((item) => !item.completed);

	if (!pendingReminders.length) {
		const placeholder = document.createElement('p');
		placeholder.className = 'reminder-overlay__placeholder';
		placeholder.textContent = '未完了のリマインダーがありません';
		listElement.appendChild(placeholder);
		summaryElement.textContent = '未完了 0件';
		return;
	}

	const sorted = [...pendingReminders].sort((a, b) => (
		new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
	));

	for (const reminder of sorted) {
		listElement.appendChild(createReminderRow(reminder));
	}

	summaryElement.textContent = `未完了 ${pendingReminders.length}件`;
};

export const setupReminderOverlay = () => {
	const overlay = document.querySelector('[data-reminder-overlay]');
	const openButton = document.getElementById('reminderBTN');

	if (!overlay || !openButton) {
		return;
	}

	const closeButton = overlay.querySelector('[data-reminder-overlay-close]');
	const listElement = overlay.querySelector('[data-reminder-list]');
	const summaryElement = overlay.querySelector('[data-reminder-summary]');

	const setOverlayOpen = (isOpen) => {
		overlay.classList.toggle('is-open', isOpen);
	};

	const refresh = async () => {
		const reminders = await getStoredReminders();
		renderReminderList(listElement, summaryElement, reminders);
	};

	openButton.addEventListener('click', async () => {
		await refresh();
		setOverlayOpen(true);
	});
	closeButton?.addEventListener('click', () => setOverlayOpen(false));
	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			setOverlayOpen(false);
		}
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			setOverlayOpen(false);
		}
	});

	listElement?.addEventListener('click', async (event) => {
		const button = event.target.closest('[data-reminder-id]');
		if (!button) {
			return;
		}

		const id = button.dataset.reminderId;
		const completed = button.dataset.reminderCompleted !== 'true';
		button.disabled = true;

		const result = await sendReminderCompletion(id, completed);
		if (!result?.ok) {
			button.textContent = '失敗';
			setTimeout(() => {
				button.disabled = false;
				refresh();
			}, 1200);
			return;
		}

		await refresh();
		button.disabled = false;
	});
};
