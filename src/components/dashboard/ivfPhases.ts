// IVF cycle phases, kept apart from IVFTracker so the Home hero
// (IVFTimelineHero) can read them without loading the whole tracker.
export const IVF_PHASES = [
  { key: 'prep', label: 'Preparation', duration: '2–4 weeks', description: 'Birth control or estrogen priming to synchronize your cycle', tips: ['Take medications on time', 'Reduce caffeine intake', 'Start CoQ10 and prenatal vitamins'] },
  { key: 'stimulation', label: 'Ovarian Stimulation', duration: '8–14 days', description: 'Hormone injections to stimulate multiple egg growth', tips: ['Keep injection times consistent', 'Stay hydrated — aim for 2L/day', 'Avoid intense exercise', 'Attend all monitoring appointments'] },
  { key: 'trigger', label: 'Trigger Shot', duration: '1 day', description: 'Precisely timed injection to mature eggs before retrieval', tips: ['Timing is critical — follow exact schedule', 'Set multiple alarms', 'Arrange transport for retrieval day'] },
  { key: 'retrieval', label: 'Egg Retrieval', duration: '1 day', description: 'Eggs collected under light sedation (15–20 min procedure)', tips: ['Fast from midnight before', 'Wear comfortable clothing', 'Rest for 1–2 days after', 'Mild cramping and bloating is normal'] },
  { key: 'fertilization', label: 'Fertilization & Culture', duration: '3–6 days', description: 'Eggs fertilized and embryos monitored in the lab', tips: ['The clinic will update you on embryo progress', 'Try to stay busy and distracted', 'Day 3 or Day 5 transfer will be decided'] },
  { key: 'transfer', label: 'Embryo Transfer', duration: '1 day', description: 'One or two embryos placed into the uterus', tips: ['Full bladder may be needed', 'Procedure is painless (no sedation)', 'Rest the day of transfer', 'Start progesterone support as directed'] },
  { key: 'tww', label: 'Two-Week Wait (TWW)', duration: '10–14 days', description: 'Waiting period before pregnancy test (beta HCG)', tips: ['Avoid home pregnancy tests before beta day', 'Continue all medications', 'Gentle walking is fine', 'Be kind to yourself — this is the hardest part'] },
  { key: 'beta', label: 'Beta HCG Test', duration: '1 day', description: 'Blood test to confirm pregnancy', tips: ['Results usually same day', 'If positive, repeat in 48h to confirm doubling', 'If negative, discuss next steps with your doctor'] },
];
