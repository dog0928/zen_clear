import {
	callApiV2MaterialChapter,
	callApiV2MaterialCourse,
	callApiV2ReportProgressMonthly,
} from './api.js';

const defaultTimeProgressGroup = () => ({ goal: 0, current: 0 });

const mergeTimeProgress = (left, right) => {
	const primary = {
		goal: left.primary.goal + right.primary.goal,
		current: left.primary.current + right.primary.current,
	};

	const groups = left.groups.map((group) => ({ ...group }));

	for (const { label, goal, current } of right.groups) {
		const foundGroup = groups.find((group) => group.label === label);

		if (foundGroup) {
			foundGroup.goal += goal;
			foundGroup.current += current;
		} else {
			groups.push({ label, goal, current });
		}
	}

	return { primary, groups };
};

export const flatTimeProgress = (timeProgressList) => (
	timeProgressList.reduce(
		(acc, timeProgress) => mergeTimeProgress(acc, timeProgress),
		{ primary: defaultTimeProgressGroup(), groups: [] },
	)
);

const calcTimeProgressGroup = (resources, getTime, isDone) => {
	const safeResources = Array.isArray(resources) ? resources : [];

	return safeResources.reduce((acc, resource) => {
		const time = Number(getTime(resource) ?? 0);
		return {
			goal: acc.goal + time,
			current: acc.current + (isDone(resource) ? time : 0),
		};
	}, defaultTimeProgressGroup());
};

const calcMovieResourcesTimeProgressGroup = (movieResources, isWatched) => {
	const safeMovieResources = Array.isArray(movieResources) ? movieResources : [];

	return calcTimeProgressGroup(
		safeMovieResources,
		(resource) => Number(resource.length ?? 0),
		(resource) => Boolean(isWatched(resource)),
	);
};

const calcNSchoolSectionsTimeProgressGroup = (sections) => (
	calcMovieResourcesTimeProgressGroup(sections, (section) => section.passed)
);

const createNSchoolTimeProgress = (data = {}) => ({
	primary: data.mainMovie ?? defaultTimeProgressGroup(),
	groups: [
		{ label: '全動画', timeProgressGroup: data.allMovie },
		{ label: '必須', timeProgressGroup: data.mainMovie },
		{ label: 'Nプラス', timeProgressGroup: data.supplementMovie },
	].map(({ label, timeProgressGroup }) => ({
		label,
		...(timeProgressGroup ?? defaultTimeProgressGroup()),
	})),
});

const createAdvancedTimeProgress = (data = {}) => ({
	primary: data.movie ?? defaultTimeProgressGroup(),
	groups: [
		{ label: '動画', timeProgressGroup: data.movie },
		{ label: '授業', timeProgressGroup: data.lesson },
	].map(({ label, timeProgressGroup }) => ({
		label,
		...(timeProgressGroup ?? defaultTimeProgressGroup()),
	})),
});

export const fetchChapterTimeProgress = async (chapterPageInfo) => {
	const { course_type: courseType, chapter } = await callApiV2MaterialChapter(chapterPageInfo);

	if (courseType === 'n_school') {
		const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];

		const allMovies = sections.filter((section) => section.resource_type === 'movie');
		const mainMovies = allMovies.filter((section) => section.material_type === 'main');
		const supplementMovies = allMovies.filter((section) => section.material_type === 'supplement');

		return createNSchoolTimeProgress({
			allMovie: calcNSchoolSectionsTimeProgressGroup(allMovies),
			mainMovie: calcNSchoolSectionsTimeProgressGroup(mainMovies),
			supplementMovie: calcNSchoolSectionsTimeProgressGroup(supplementMovies),
		});
	}

	if (courseType === 'advanced') {
		const classHeaders = Array.isArray(chapter?.class_headers) ? chapter.class_headers : [];

		const movieSections = [];
		const lessonSections = [];

		for (const header of classHeaders) {
			if (header?.name === 'section') {
				for (const section of header.sections ?? []) {
					if (section?.resource_type === 'movie') {
						movieSections.push(section);
					}
				}
			} else if (header?.name === 'lesson') {
				for (const section of header.sections ?? []) {
					if (section?.resource_type === 'lesson') {
						lessonSections.push(section);
					}
				}
			}
		}

		return createAdvancedTimeProgress({
			movie: calcMovieResourcesTimeProgressGroup(
				movieSections,
				(section) => {
					const comprehension = section?.progress?.comprehension;
					return comprehension && comprehension.good === comprehension.limit;
				},
			),
			lesson: calcTimeProgressGroup(
				lessonSections,
				(section) => {
					if (section?.archive) {
						return Math.max(0, section.archive.second - section.archive.start_offset);
					}

					return Number(section?.minute ?? 0) * 60;
				},
				(section) => section?.status_label === 'watched',
			),
		});
	}

	return createNSchoolTimeProgress();
};

export const fetchCourseTimeProgress = async (coursePageInfo) => {
	const { course } = await callApiV2MaterialCourse(coursePageInfo);
	const chapters = Array.isArray(course?.chapters) ? course.chapters : [];

	const timeProgressPromises = chapters.flatMap((chapterItem) => (
		chapterItem?.resource_type === 'chapter' && typeof chapterItem.id === 'number'
			? [fetchChapterTimeProgress({
				courseId: coursePageInfo.courseId,
				chapterId: chapterItem.id,
			})]
			: []
	));

	if (timeProgressPromises.length > 0) {
		const timeProgressList = await Promise.all(timeProgressPromises);
		return flatTimeProgress(timeProgressList);
	}

	switch (course?.type) {
		case 'n_school':
			return createNSchoolTimeProgress({});
		case 'advanced':
			return createAdvancedTimeProgress({});
		default:
			return createNSchoolTimeProgress();
	}
};

const buildMonthlyReportChapterList = (monthlyReport) => {
	const chapterMap = new Map();

	const append = (chapter) => {
		if (!chapter) {
			return;
		}

		const key = `${chapter.course_id}:${chapter.chapter_id}`;

		if (!chapterMap.has(key)) {
			chapterMap.set(key, {
				courseId: chapter.course_id,
				chapterId: chapter.chapter_id,
			});
		}
	};

	for (const group of monthlyReport?.deadline_groups ?? []) {
		for (const chapter of group?.chapters ?? []) {
			append(chapter);
		}
	}

	for (const chapter of monthlyReport?.completed_chapters ?? []) {
		append(chapter);
	}

	return Array.from(chapterMap.values());
};

const calcMonthlyReportTimeProgress = async (monthlyReport) => {
	const chapterPageInfos = buildMonthlyReportChapterList(monthlyReport);

	if (!chapterPageInfos.length) {
		return createNSchoolTimeProgress();
	}

	const timeProgressList = await Promise.all(
		chapterPageInfos.map((chapterPageInfo) => fetchChapterTimeProgress(chapterPageInfo)),
	);

	return flatTimeProgress(timeProgressList);
};

export const fetchMonthlyReportsTimeProgress = async (monthlyReportsPageInfo) => {
	const report = await callApiV2ReportProgressMonthly(monthlyReportsPageInfo);
	return calcMonthlyReportTimeProgress(report);
};

const countCompletedReportChapters = (monthlyReport) => {
	const completed = Array.isArray(monthlyReport?.completed_chapters) ? monthlyReport.completed_chapters : [];
	const seen = new Set();
	let count = 0;

	for (const chapter of completed) {
		const courseId = chapter?.course_id;
		const chapterId = chapter?.chapter_id;

		if (typeof courseId === 'number' && typeof chapterId === 'number') {
			const key = `${courseId}:${chapterId}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
		}

		count += 1;
	}

	return count;
};

const countMonthlyReportChapters = (monthlyReport) => (
	buildMonthlyReportChapterList(monthlyReport).length
);

const buildMonthlyReportCompletionSummary = (monthlyReport) => ({
	completedCount: countCompletedReportChapters(monthlyReport),
	totalCount: countMonthlyReportChapters(monthlyReport),
});

export const fetchMonthlyReportsTimeProgressWithSummary = async (monthlyReportsPageInfo) => {
	const report = await callApiV2ReportProgressMonthly(monthlyReportsPageInfo);

	return {
		progress: await calcMonthlyReportTimeProgress(report),
		summary: buildMonthlyReportCompletionSummary(report),
	};
};

export const fetchMonthlyReportsCompletionSummary = async (monthlyReportsPageInfo) => {
	const report = await callApiV2ReportProgressMonthly(monthlyReportsPageInfo);
	return buildMonthlyReportCompletionSummary(report);
};

export const fetchMonthlyReportMeta = async (monthlyReportsPageInfo) => (
	callApiV2ReportProgressMonthly(monthlyReportsPageInfo)
);
