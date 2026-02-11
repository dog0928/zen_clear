import { DEFAULT_ZEN_STUDY_SITE_ORIGIN } from './constants.js';
import { buildMonthlyReportUrlPattern } from './config.js';

let monthlyReportUrlPattern = buildMonthlyReportUrlPattern(DEFAULT_ZEN_STUDY_SITE_ORIGIN);

export const setMonthlyReportUrlPattern = (siteOrigin) => {
	monthlyReportUrlPattern = buildMonthlyReportUrlPattern(siteOrigin);
};

const parseMonthlyReportUrl = (urlString) => {
	try {
		const url = new URL(urlString);
		const match = url.pathname.match(/^\/study_plans\/month\/(\d+)\/(\d+)\/?$/);

		if (!match) {
			return null;
		}

		const [, yearStr, monthStr] = match;
		const year = Number(yearStr);
		const month = Number(monthStr);

		if (Number.isNaN(year) || Number.isNaN(month)) {
			return null;
		}

		return { year, month };
	} catch {
		return null;
	}
};

const queryMonthlyReportTabs = () => new Promise((resolve, reject) => {
	if (!chrome?.tabs?.query) {
		resolve([]);
		return;
	}

	chrome.tabs.query({ url: monthlyReportUrlPattern }, (tabs) => {
		if (chrome.runtime.lastError) {
			reject(new Error(chrome.runtime.lastError.message));
			return;
		}

		resolve(tabs ?? []);
	});
});

export const getCurrentMonthlyReportInfo = async () => {
	try {
		const tabs = await queryMonthlyReportTabs();

		const parseTab = (tab) => (tab?.url ? parseMonthlyReportUrl(tab.url) : null);

		const preferredTab = tabs.find((tab) => tab.active && parseTab(tab));
		const fallbackTab = tabs.find((tab) => parseTab(tab));
		const tabInfo = parseTab(preferredTab ?? fallbackTab);

		if (tabInfo) {
			return tabInfo;
		}
	} catch {
		// ignore and fallback to current date
	}

	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
};
