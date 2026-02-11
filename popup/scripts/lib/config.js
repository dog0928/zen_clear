import {
	DEFAULT_ZEN_STUDY_SITE_ORIGIN,
	DEFAULT_CHATGPT_URL,
	DEFAULT_CHATGPT_MATCH_PATTERNS,
} from './constants.js';

const getZenConfig = () => globalThis.ZEN_CONFIG ?? {};

const normalizeOrigin = (origin, fallback) => {
	if (typeof origin !== 'string') {
		return fallback;
	}
	const trimmed = origin.trim();
	return trimmed ? trimmed.replace(/\/$/, '') : fallback;
};

const normalizeUrl = (url, fallback) => {
	try {
		return new URL(url).toString();
	} catch {
		return fallback;
	}
};

const normalizePatternList = (value, fallback) => {
	const patterns = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[\r\n,]+/)
			: [];

	const cleaned = patterns.map((pattern) => pattern.trim()).filter(Boolean);
	return cleaned.length ? cleaned : fallback;
};

export const getZenStudyConfig = () => ({
	siteOrigin: normalizeOrigin(getZenConfig()?.zenStudy?.siteOrigin, DEFAULT_ZEN_STUDY_SITE_ORIGIN),
});

export const getChatGptConfig = () => ({
	homeUrl: normalizeUrl(getZenConfig()?.chatgpt?.homeUrl, DEFAULT_CHATGPT_URL),
	matchPatterns: normalizePatternList(
		getZenConfig()?.chatgpt?.matchPatterns,
		DEFAULT_CHATGPT_MATCH_PATTERNS,
	),
});

export const buildMonthlyReportUrlPattern = (siteOrigin) => (
	`${normalizeOrigin(siteOrigin, DEFAULT_ZEN_STUDY_SITE_ORIGIN)}/study_plans/month/*`
);
