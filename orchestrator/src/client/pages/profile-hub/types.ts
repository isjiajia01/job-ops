export type SkillFormItem = {
  id: string;
  name: string;
  keywordsText: string;
};

export type ExperienceFormItem = {
  id: string;
  company: string;
  position: string;
  location: string;
  date: string;
  summary: string;
};

export type ProjectFormItem = {
  id: string;
  name: string;
  date: string;
  summary: string;
  keywordsText: string;
  url: string;
};

export type FactFormItem = {
  id: string;
  title: string;
  detail: string;
};

export type FixedFactSlot = {
  key: string;
  title: string;
  description: string;
  placeholder: string;
};
