export type CvVariant = "thrive" | "adult" | "veteran";

export interface CvDraft {
  variant: CvVariant;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  skills: string;
  exp: string;
  summary: string;
  updatedAt: string;
}

export type MyCvDrafts = Record<CvVariant, CvDraft | null>;

export interface SaveCvDraftInput {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  skills: string;
  exp: string;
  summary: string;
}

export interface SchoolPassportDraft {
  studentId: string;
  yearGroup: string;
  skills: string;
  exp: string;
  summary: string;
  updatedAt: string;
}

export interface SaveSchoolPassportInput {
  studentId: string;
  yearGroup: string;
  skills: string;
  exp: string;
  summary: string;
}
