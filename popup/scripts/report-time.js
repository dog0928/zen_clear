import { setZenStudyConfig } from './zenTimeApi.js';
import { getChatGptConfig, getZenStudyConfig } from './lib/config.js';
import { setMonthlyReportUrlPattern } from './lib/monthly-report.js';
import { updateCurrentMonth, updateReportCount, updateReportTime } from './lib/report-summary.js';
import { setupCalendarButton } from './lib/calendar-button.js';
import { setupReminderOverlay } from './lib/reminders.js';
import { setupReportRangeOverlay } from './lib/report-range-overlay.js';
import { setupScheduleOverlay } from './lib/schedule-overlay.js';

document.addEventListener('DOMContentLoaded', () => {
	const zenStudyConfig = getZenStudyConfig();
	setZenStudyConfig(zenStudyConfig);
	setMonthlyReportUrlPattern(zenStudyConfig.siteOrigin);

	const chatGptConfig = getChatGptConfig();

	const monthElement = document.querySelector('.month');
	const remainingTimeElement = document.querySelector('[data-remaining-report-time]');
	const ramainingPercentElement = document.querySelector('[data-remaining-report-percent]');
	const reportCountElement = document.querySelector('[data-deadline-report-count]');
	const calendarButton = document.getElementById('calendarBTN');

	if (monthElement) {
		updateCurrentMonth(monthElement);
	}
	if (remainingTimeElement) {
		updateReportTime(remainingTimeElement, ramainingPercentElement);
	}
	if (reportCountElement) {
		updateReportCount(reportCountElement);
	}

	setupReportRangeOverlay();
	setupScheduleOverlay(chatGptConfig);
	setupCalendarButton(calendarButton, chatGptConfig);
	setupReminderOverlay();
});
