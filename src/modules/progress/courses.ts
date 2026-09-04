/**
 * The fixed set of enrollable courses. Small and unlikely to change often
 * enough to justify a database-driven catalogue — matches how the old
 * user_progress table hardcoded lift/stem as columns rather than rows in a
 * generic table.
 */
export const COURSES = {
  lift: { label: 'The Lift Project', required: true, group: 'prerequisite' },
  lion_voices: { label: 'Lion Voices', required: true, group: 'prerequisite' },
  stem: { label: 'STEM Sports', required: false, group: 'prerequisite' },
  rise_awareness: { label: 'Raise Awareness', required: true, group: 'rise' },
  rise_resilience: { label: 'Build Resilience', required: true, group: 'rise' },
} as const;

export type CourseKey = keyof typeof COURSES;
export type CourseGroup = (typeof COURSES)[CourseKey]['group'];

export const COURSE_KEYS = Object.keys(COURSES) as CourseKey[];
export const PREREQUISITE_COURSE_KEYS = COURSE_KEYS.filter((k) => COURSES[k].group === 'prerequisite');
export const RISE_COURSE_KEYS = COURSE_KEYS.filter((k) => COURSES[k].group === 'rise');

/** Translate unlocks once every *required* prerequisite course is completed. */
export const TRANSLATE_REQUIRED_COURSES = PREREQUISITE_COURSE_KEYS.filter((k) => COURSES[k].required);

export function isCourseKey(value: string): value is CourseKey {
  return Object.prototype.hasOwnProperty.call(COURSES, value);
}

export const PATHWAYS = ['thrive', 'adult', 'school', 'veterans', 'rise'] as const;
export type Pathway = (typeof PATHWAYS)[number];

export function isPathway(value: string): value is Pathway {
  return (PATHWAYS as readonly string[]).includes(value);
}

export interface CourseStatusEntry {
  status: 'not_enrolled' | 'enrolled' | 'in_progress' | 'completed';
  enrolledAt: string | null;
  statusUpdatedAt: string | null;
}

interface EnrollmentLike {
  status: 'enrolled' | 'in_progress' | 'completed';
  enrolled_at: Date;
  status_updated_at: Date;
}

/** Fills in every course key, defaulting anything the user hasn't enrolled in to 'not_enrolled'. */
export function buildCourseMap(
  enrollments: Map<CourseKey, EnrollmentLike>,
): Record<CourseKey, CourseStatusEntry> {
  const courses = {} as Record<CourseKey, CourseStatusEntry>;
  for (const key of COURSE_KEYS) {
    const row = enrollments.get(key);
    courses[key] = row
      ? {
          status: row.status,
          enrolledAt: row.enrolled_at.toISOString(),
          statusUpdatedAt: row.status_updated_at.toISOString(),
        }
      : { status: 'not_enrolled', enrolledAt: null, statusUpdatedAt: null };
  }
  return courses;
}

export function isTranslateEligible(courses: Record<CourseKey, CourseStatusEntry>): boolean {
  return TRANSLATE_REQUIRED_COURSES.every((key) => courses[key].status === 'completed');
}
