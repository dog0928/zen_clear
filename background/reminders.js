const STORAGE_KEY = 'zenReminders';
const ALARM_PREFIX = 'zen-reminder-';
const REMINDER_DAYS_BEFORE = 3;
const DEFAULT_REMINDER_HOUR = 9;
const NOTIFICATION_ICON = 'icons/icon128.png';

const storageGet = (key) => new Promise((resolve) => {
	chrome.storage.local.get(key, (data) => resolve(data[key]));
});

const storageSet = (value) => new Promise((resolve) => {
	chrome.storage.local.set(value, resolve);
});

const getStoredReminders = async () => {
	const stored = await storageGet(STORAGE_KEY);
	return Array.isArray(stored) ? stored : [];
};

const hashString = (value) => {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = Math.imul(31, hash) + value.charCodeAt(i);
		hash |= 0;
	}
	return `rem-${Math.abs(hash)}`;
};

const buildAlarmName = (id) => `${ALARM_PREFIX}${id}`;

const parseDate = (value) => {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateText = (value, hasTime) => {
	const date = parseDate(value);
	if (!date) {
		return '';
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

const computeReminderAt = (startAt, hasTime) => {
	const startDate = parseDate(startAt);
	if (!startDate) {
		return null;
	}
	const reminderDate = new Date(startDate);
	reminderDate.setDate(reminderDate.getDate() - REMINDER_DAYS_BEFORE);
	if (!hasTime) {
		reminderDate.setHours(DEFAULT_REMINDER_HOUR, 0, 0, 0);
	}
	return reminderDate;
};

const buildReminderFromEvent = (event) => {
	if (!event || typeof event !== 'object') {
		return null;
	}

	const title = typeof event.title === 'string' ? event.title.trim() : '';
	const startAt = typeof event.startAt === 'string' ? event.startAt : '';
	const endAt = typeof event.endAt === 'string' ? event.endAt : '';
	const hasTime = Boolean(event.hasTime);

	if (!startAt) {
		return null;
	}

	const reminderAt = computeReminderAt(startAt, hasTime);
	const nowIso = new Date().toISOString();
	const id = hashString(`${title}|${startAt}|${endAt}`);

	return {
		id,
		title: title || '予定',
		description: typeof event.description === 'string' ? event.description : '',
		location: typeof event.location === 'string' ? event.location : '',
		startAt,
		endAt,
		hasTime,
		reminderAt: reminderAt ? reminderAt.toISOString() : null,
		createdAt: nowIso,
		updatedAt: nowIso,
		completed: false,
		completedAt: null,
		notified: false,
		notifiedAt: null,
		source: 'chatgpt',
	};
};

const scheduleAlarmForReminder = (reminder) => {
	if (!reminder || reminder.completed || reminder.notified) {
		return;
	}
	const when = parseDate(reminder.reminderAt)?.getTime();
	if (!when || when <= Date.now()) {
		return;
	}
	chrome.alarms.create(buildAlarmName(reminder.id), { when });
};

const clearAlarmForReminder = (id) => (
	new Promise((resolve) => chrome.alarms.clear(buildAlarmName(id), resolve))
);

const getAllAlarms = () => new Promise((resolve) => {
	chrome.alarms.getAll(resolve);
});

const syncAlarmsWithReminders = async (reminders) => {
	const alarms = await getAllAlarms();
	const activeAlarmNames = new Set(reminders.map((reminder) => buildAlarmName(reminder.id)));

	for (const alarm of alarms) {
		if (alarm.name.startsWith(ALARM_PREFIX) && !activeAlarmNames.has(alarm.name)) {
			await new Promise((resolve) => chrome.alarms.clear(alarm.name, resolve));
		}
	}

	for (const reminder of reminders) {
		scheduleAlarmForReminder(reminder);
	}
};

const resyncAllReminders = async () => {
	const reminders = await getStoredReminders();
	await syncAlarmsWithReminders(reminders);
};

const addReminders = async (events) => {
	const normalizedEvents = Array.isArray(events) ? events : [];
	if (!normalizedEvents.length) {
		return { ok: false, addedCount: 0, skippedCount: 0 };
	}

	const existing = await getStoredReminders();
	const existingIds = new Set(existing.map((reminder) => reminder.id));
	const additions = [];

	for (const event of normalizedEvents) {
		const reminder = buildReminderFromEvent(event);
		if (!reminder || existingIds.has(reminder.id)) {
			continue;
		}
		existingIds.add(reminder.id);
		additions.push(reminder);
		existing.push(reminder);
	}

	if (additions.length) {
		await storageSet({ [STORAGE_KEY]: existing });
		for (const reminder of additions) {
			scheduleAlarmForReminder(reminder);
		}
	}

	return {
		ok: true,
		addedCount: additions.length,
		skippedCount: normalizedEvents.length - additions.length,
	};
};

const updateReminderCompletion = async (id, completed) => {
	if (!id) {
		return { ok: false };
	}

	const reminders = await getStoredReminders();
	let updatedReminder = null;
	const nowIso = new Date().toISOString();
	const updated = reminders.map((reminder) => {
		if (reminder.id !== id) {
			return reminder;
		}
		updatedReminder = {
			...reminder,
			completed: Boolean(completed),
			completedAt: completed ? nowIso : null,
			updatedAt: nowIso,
		};
		return updatedReminder;
	});

	if (!updatedReminder) {
		return { ok: false };
	}

	await storageSet({ [STORAGE_KEY]: updated });

	if (updatedReminder.completed) {
		await clearAlarmForReminder(id);
	} else {
		scheduleAlarmForReminder(updatedReminder);
	}

	return { ok: true };
};

const markReminderNotified = async (id) => {
	if (!id) {
		return;
	}

	const reminders = await getStoredReminders();
	const nowIso = new Date().toISOString();
	const updated = reminders.map((reminder) => {
		if (reminder.id !== id) {
			return reminder;
		}
		return {
			...reminder,
			notified: true,
			notifiedAt: nowIso,
			updatedAt: nowIso,
		};
	});
	await storageSet({ [STORAGE_KEY]: updated });
};

const showReminderNotification = (reminder) => new Promise((resolve) => {
	const dueText = formatDateText(reminder.startAt, reminder.hasTime);
	const titleText = reminder.title || '予定';
	const message = dueText
		? `「${titleText}」の期限が3日前です (${dueText})`
		: `「${titleText}」の期限が3日前です`;

	chrome.notifications.create(
		`zen-reminder-${reminder.id}`,
		{
			type: 'basic',
			iconUrl: NOTIFICATION_ICON,
			title: 'リマインダー',
			message,
		},
		() => resolve(),
	);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || typeof message.type !== 'string') {
		return;
	}

	if (message.type === 'ZEN_REMINDER_ADD') {
		addReminders(message.events)
			.then((result) => sendResponse(result))
			.catch(() => sendResponse({ ok: false }));
		return true;
	}

	if (message.type === 'ZEN_REMINDER_COMPLETE') {
		updateReminderCompletion(message.id, message.completed)
			.then((result) => sendResponse(result))
			.catch(() => sendResponse({ ok: false }));
		return true;
	}
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (!alarm?.name?.startsWith(ALARM_PREFIX)) {
		return;
	}
	const id = alarm.name.slice(ALARM_PREFIX.length);
	getStoredReminders()
		.then(async (reminders) => {
			const reminder = reminders.find((item) => item.id === id);
			if (!reminder || reminder.completed || reminder.notified) {
				return;
			}
			await showReminderNotification(reminder);
			await markReminderNotified(id);
		})
		.catch((error) => {
			console.error('Failed to handle reminder alarm', error);
		});
});

chrome.runtime.onInstalled.addListener(() => {
	resyncAllReminders().catch((error) => {
		console.error('Failed to resync reminders on install', error);
	});
});

chrome.runtime.onStartup.addListener(() => {
	resyncAllReminders().catch((error) => {
		console.error('Failed to resync reminders on startup', error);
	});
});

resyncAllReminders().catch((error) => {
	console.error('Failed to resync reminders on init', error);
});
