import type { Category } from './types';

const names = [
  ['Personal growth','🌱'],['Productivity','⚡'],['Time management','⏱️'],['Decision making','🧭'],['Confidence','🦁'],['Resilience','🛡️'],['Emotional health','💛'],['Mental health','🧠'],['Mindfulness','🧘'],['Sleep','🌙'],
  ['Nutrition','🥗'],['Strength training','🏋️'],['Running','🏃'],['Cycling','🚴'],['Swimming','🏊'],['Mobility','🤸'],['Sports','🏅'],['Outdoor fitness','🥾'],['Preventive care','🩺'],['Accessibility','♿'],
  ['Family','👨‍👩‍👧'],['Parenting','🧸'],['Marriage','💍'],['Friendship','🤝'],['Community','🏘️'],['Networking','🫱🏻‍🫲🏽'],['Communication','💬'],['Conflict resolution','🕊️'],['Volunteering','🙌'],['Pets','🐾'],
  ['Budgeting','📊'],['Saving','🏦'],['Investing','📈'],['Taxes','🧾'],['Insurance','🛡️'],['Real estate','🏠'],['Entrepreneurship','🚀'],['Side income','💡'],['Shopping','🛍️'],['Giving','🎁'],
  ['Leadership','👑'],['Management','🗂️'],['Job search','🔎'],['Freelancing','🧑‍💻'],['Remote work','🌐'],['Public speaking','🎤'],['Writing at work','✍️'],['Negotiation','🤝'],['Mentoring','🧑‍🏫'],['Professional brand','✨'],
  ['Languages','🗣️'],['Reading','📖'],['Courses','🎓'],['Research','🔬'],['Mathematics','➗'],['Science','🧪'],['History','🏛️'],['Philosophy','📜'],['Civic knowledge','🏛️'],['Study systems','📝'],
  ['Programming','💻'],['Web development','🌍'],['Mobile apps','📱'],['AI','🤖'],['Data','📊'],['Cybersecurity','🔐'],['Cloud','☁️'],['Robotics','🦾'],['Electronics','🔌'],['Open source','🐙'],
  ['Photography','📷'],['Video','🎬'],['Music','🎵'],['Drawing','✏️'],['Painting','🎨'],['Design','🖼️'],['Writing','🖋️'],['Poetry','📝'],['Crafts','🧶'],['Performance','🎭'],
  ['Cooking','🍳'],['Baking','🥖'],['Gardening','🌿'],['Home projects','🔨'],['Decluttering','🧺'],['Interior design','🛋️'],['Sustainability','♻️'],['Vehicles','🚗'],['Personal style','👔'],['Routines','🔁'],
  ['Destinations','🗺️'],['Road trips','🚙'],['Backpacking','🎒'],['Culture','🏺'],['Food travel','🍜'],['Nature','🌲'],['Beaches','🏝️'],['Mountains','⛰️'],['Events','🎟️'],['Adventure','🪂'],
  ['Faith','🕌'],['Prayer','🤲'],['Gratitude','🙏'],['Values','💎'],['Service','🌍'],['Environment','🌎'],['Human rights','⚖️'],['Local impact','📍'],['Legacy','🌳'],['Learning in public','📣'],
  ['Goals','🎯'],['Projects','📁'],['Habits','✅'],['Journaling','📔'],['Memories','🧠'],['Celebrations','🎉'],['Rest','🛋️'],['Play','🎮'],['Experiences','✨'],['Life planning','🗓️'],
];

export const EXTENDED_CATEGORIES: Category[] = names.map(([name, icon], i) => ({ id: `area-${i + 1}`, name, icon, color: ['#6366f1','#0ea5e9','#14b8a6','#f59e0b','#ec4899','#8b5cf6'][i % 6] }));
