export type FaqTemplate = {
  key: string
  questionKey: string
  contentKey: string
}

export const FAQ_TEMPLATES: FaqTemplate[] = [
  {
    key: 'check_in_out_hours',
    questionKey: 'faqTemplates.check_in_out_hours.question',
    contentKey: 'faqTemplates.check_in_out_hours.content',
  },
  {
    key: 'parking',
    questionKey: 'faqTemplates.parking.question',
    contentKey: 'faqTemplates.parking.content',
  },
  {
    key: 'wifi',
    questionKey: 'faqTemplates.wifi.question',
    contentKey: 'faqTemplates.wifi.content',
  },
  {
    key: 'late_checkout',
    questionKey: 'faqTemplates.late_checkout.question',
    contentKey: 'faqTemplates.late_checkout.content',
  },
  {
    key: 'pets',
    questionKey: 'faqTemplates.pets.question',
    contentKey: 'faqTemplates.pets.content',
  },
]
