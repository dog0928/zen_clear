import {
	fetchChapterTimeProgress,
	fetchCourseTimeProgress,
	flatTimeProgress,
} from '../zenTimeApi.js';
import { formatProgressAndGoalText } from './format.js';

const IGNORE_SUBJECT_PATTERNS = [
	/普通科/,
	/大修館書店版/,
	/光村図書版/,
	/第一学習社版/,
];

const isIgnorableSubjectName = (name) => IGNORE_SUBJECT_PATTERNS.some((pattern) => pattern.test(name));

export const detectSpecialSubjects = (monthlyReport) => {
	const names = new Set();
	const appendName = (value) => {
		if (typeof value === 'string' && value.trim() && !isIgnorableSubjectName(value)) {
			names.add(value.trim());
		}
	};

	const collectFromChapter = (chapter) => {
		if (!chapter) {
			return;
		}
		appendName(chapter.course_name);
		appendName(chapter.course_title);
		appendName(chapter.title);
		appendName(chapter.name);
		appendName(chapter?.course?.name);
		appendName(chapter?.course?.title);
	};

	const collectFromGroup = (group) => {
		if (!group) {
			return;
		}
		appendName(group.course_name);
		appendName(group.course_title);
		appendName(group.name);
		appendName(group.title);
		appendName(group?.course?.name);
		appendName(group?.course?.title);

		if (Array.isArray(group.chapters)) {
			for (const chapter of group.chapters) {
				collectFromChapter(chapter);
			}
		}
	};

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			collectFromGroup(group);
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			collectFromChapter(chapter);
		}
	}

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendName(course?.name);
			appendName(course?.title);
		}
	}

	const nameList = Array.from(names);
	let hasPE = nameList.some((name) => name.includes('体育'));
	let hasHomeEc = nameList.some((name) => name.includes('家庭'));

	if (!(hasPE && hasHomeEc)) {
		try {
			const serialized = JSON.stringify(monthlyReport) ?? '';
			hasPE = hasPE || serialized.includes('体育');
			hasHomeEc = hasHomeEc || serialized.includes('家庭');
		} catch (error) {
			console.warn('Failed to stringify monthlyReport for subject detection', error);
		}
	}

	return { hasPE, hasHomeEc };
};

export const collectSubjectNames = (monthlyReport) => {
	const names = new Set();
	const appendName = (value) => {
		if (typeof value === 'string' && value.trim() && !isIgnorableSubjectName(value)) {
			names.add(value.trim());
		}
	};

	const collectFromChapter = (chapter) => {
		if (!chapter) {
			return;
		}
		appendName(chapter.course_name);
		appendName(chapter.course_title);
		appendName(chapter.title);
		appendName(chapter.name);
		appendName(chapter?.course?.name);
		appendName(chapter?.course?.title);
	};

	const collectFromGroup = (group) => {
		if (!group) {
			return;
		}
		appendName(group.course_name);
		appendName(group.course_title);
		appendName(group.name);
		appendName(group.title);
		appendName(group?.course?.name);
		appendName(group?.course?.title);

		if (Array.isArray(group.chapters)) {
			for (const chapter of group.chapters) {
				collectFromChapter(chapter);
			}
		}
	};

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendName(course?.name);
			appendName(course?.title);
		}
	}

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			collectFromGroup(group);
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			collectFromChapter(chapter);
		}
	}

	const knownKeywords = [
		'国語', '現代文', '古典', '数学', '算数', '理科', '生物', '化学', '物理', '地学',
		'社会', '地理', '歴史', '日本史', '世界史', '公民', '政治', '経済', '倫理',
		'英語', '英会話', '外国語', '中国語', '韓国語', 'フランス語', 'ドイツ語',
		'体育', '保健', '家庭', '家庭科', '家庭総合', '技術', '情報', '美術', '音楽', '書道',
		'商業', '簿記', 'デザイン', '表現',
	];

	try {
		const serialized = JSON.stringify(monthlyReport) ?? '';
		for (const keyword of knownKeywords) {
			if (serialized.includes(keyword)) {
				names.add(keyword);
			}
		}
	} catch (error) {
		console.warn('Failed to stringify monthlyReport for subject collection', error);
	}

	return Array.from(names);
};

const buildCourseChapterMap = (monthlyReport) => {
	const map = new Map();

	const appendChapter = (chapter, fallbackName) => {
		if (!chapter || typeof chapter.course_id !== 'number' || typeof chapter.chapter_id !== 'number') {
			return;
		}

		const courseId = chapter.course_id;
		const courseName = (() => {
			const candidate = (
				chapter.course_name
				|| chapter.course_title
				|| chapter.title
				|| chapter.name
				|| chapter?.course?.name
				|| chapter?.course?.title
				|| fallbackName
			);
			return typeof candidate === 'string' ? candidate.trim() : '';
		})();

		if (!map.has(courseId)) {
			map.set(courseId, {
				courseId,
				name: courseName || `科目${courseId}`,
				chapters: new Set(),
			});
		}

		const entry = map.get(courseId);
		if (courseName && !isIgnorableSubjectName(courseName)) {
			entry.name = courseName;
		}
		entry.chapters.add(chapter.chapter_id);
	};

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendChapter(
				{ course_id: course.id, chapter_id: -1, course_name: course.name || course.title },
				course.name || course.title,
			);
		}
	}

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			for (const chapter of group?.chapters ?? []) {
				appendChapter(chapter, group?.course_name || group?.name);
			}
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			appendChapter(chapter);
		}
	}

	// Remove placeholder chapters without real chapter_id
	for (const entry of map.values()) {
		entry.chapters = new Set(Array.from(entry.chapters).filter((id) => id >= 0));
	}

	return map;
};

export const fetchCourseProgressList = async (monthlyReport) => {
	const courseMap = buildCourseChapterMap(monthlyReport);
	const results = [];

	for (const entry of courseMap.values()) {
		if (isIgnorableSubjectName(entry.name)) {
			continue;
		}

		const chapterIds = Array.from(entry.chapters);
		let timeProgress = { primary: { goal: 0, current: 0 }, groups: [] };

		if (chapterIds.length) {
			const timeProgressList = await Promise.all(
				chapterIds.map((chapterId) => fetchChapterTimeProgress({
					courseId: entry.courseId,
					chapterId,
				})),
			);
			timeProgress = flatTimeProgress(timeProgressList);
		} else {
			try {
				timeProgress = await fetchCourseTimeProgress({ courseId: entry.courseId });
			} catch (error) {
				console.warn('Failed to fetch course time progress; skipping', entry.courseId, error);
				continue;
			}
		}

		results.push({
			name: entry.name,
			progress: timeProgress,
		});
	}

	return results;
};

export const formatCourseProgressList = (courseProgressList) => {
	if (!Array.isArray(courseProgressList) || !courseProgressList.length) {
		return '';
	}

	const items = courseProgressList.map((item) => {
		const { Time, Percent } = formatProgressAndGoalText(
			item.progress?.primary?.current ?? 0,
			item.progress?.primary?.goal ?? 0,
		);
		return `${item.name}:${Time}(${Percent})`;
	});

	return items.join(' / ');
};
