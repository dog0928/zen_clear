const DEFAULT_ZEN_STUDY_SITE_ORIGIN = 'https://www.nnn.ed.nico';
const ZEN_FETCH_MESSAGE_TYPE = 'ZEN_FETCH_API';

let cachedZenStudyTabId;
let zenStudySiteOrigin = DEFAULT_ZEN_STUDY_SITE_ORIGIN;

const normalizeOrigin = (origin, fallback) => {
	if (typeof origin !== 'string') {
		return fallback;
	}
	const trimmed = origin.trim();
	return trimmed ? trimmed.replace(/\/$/, '') : fallback;
};

export const setZenStudyConfig = (config = {}) => {
	zenStudySiteOrigin = normalizeOrigin(config.siteOrigin, DEFAULT_ZEN_STUDY_SITE_ORIGIN);
	cachedZenStudyTabId = undefined;
};

const getZenStudyUrlPattern = () => `${zenStudySiteOrigin}/*`;

const createZenTabNotFoundError = () => {
	const error = new Error(
		`ZEN Studyのタブが見つかりません。${zenStudySiteOrigin}/ を開いた状態で再度お試しください。`,
	);
	error.code = 'ZEN_TAB_NOT_FOUND';
	return error;
};

const queryZenStudyTabs = () => new Promise((resolve, reject) => {
	if (!chrome?.tabs?.query) {
		reject(new Error('tabs API is unavailable in this context'));
		return;
	}

	chrome.tabs.query({ url: getZenStudyUrlPattern() }, (tabs) => {
		if (chrome.runtime.lastError) {
			reject(new Error(chrome.runtime.lastError.message));
			return;
		}

		resolve(tabs ?? []);
	});
});

const getZenStudyTabId = async () => {
	if (typeof cachedZenStudyTabId === 'number') {
		return cachedZenStudyTabId;
	}

	const tabs = await queryZenStudyTabs();

	const preferredTab = tabs.find((tab) => tab.active && typeof tab.id === 'number');
	const fallbackTab = tabs.find((tab) => typeof tab.id === 'number');
	const targetTab = preferredTab ?? fallbackTab;

	if (!targetTab || typeof targetTab.id !== 'number') {
		throw createZenTabNotFoundError();
	}

	cachedZenStudyTabId = targetTab.id;
	return cachedZenStudyTabId;
};

const sendMessageToTab = (tabId, message) => new Promise((resolve, reject) => {
	chrome.tabs.sendMessage(tabId, message, (response) => {
		if (chrome.runtime.lastError) {
			reject(new Error(chrome.runtime.lastError.message));
			return;
		}

		resolve(response);
	});
});

const sendMessageToZenStudyTab = async (message, retryCount = 0) => {
	const tabId = await getZenStudyTabId();

	try {
		return await sendMessageToTab(tabId, message);
	} catch (error) {
		const messageText = error?.message ?? '';
		const shouldRetry = retryCount === 0 && (
			messageText.includes('Receiving end does not exist')
			|| messageText.includes('No tab with id')
			|| messageText.includes('The tab was closed')
		);

		if (shouldRetry) {
			cachedZenStudyTabId = undefined;
			return sendMessageToZenStudyTab(message, retryCount + 1);
		}

		throw error;
	}
};

const callApi = async (path) => {
	const response = await sendMessageToZenStudyTab({
		type: ZEN_FETCH_MESSAGE_TYPE,
		path,
	});

	if (!response || !response.ok) {
		const error = new Error(response?.message ?? `Request to ${path} failed`);

		if (response?.status) {
			error.status = response.status;
		}

		throw error;
	}

	return response.data;
};

export const callApiV2MaterialChapter = (pageInfo) => (
	callApi(`/v2/material/courses/${pageInfo.courseId}/chapters/${pageInfo.chapterId}`)
);

export const callApiV2MaterialCourse = (pageInfo) => (
	callApi(`/v2/material/courses/${pageInfo.courseId}`)
);

export const callApiV2ReportProgressMonthly = (pageInfo) => (
	callApi(`/v2/dashboard/report_progresses/monthly/${pageInfo.year}/${pageInfo.month}`)
);
