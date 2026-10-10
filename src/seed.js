// Demo data: student talent pool and a few open gigs around the Klang Valley.
// Emails use example.com so nothing real is ever sent to these people.

const students = [
  {
    id: 'stu-aina', name: 'Aina Rahman', email: 'aina.rahman@example.com', area: 'Subang Jaya',
    campus: "Taylor's University", expectedRate: 11,
    skills: ['espresso', 'latte art', 'cashier', 'customer service', 'english', 'bahasa melayu'],
    availability: { Sat: ['08:00-18:00'], Sun: ['08:00-18:00'], Wed: ['14:00-18:00'] },
    bio: 'Second-year hospitality student. I worked 8 months as a barista at a specialty cafe in SS15, pulling espresso shots and doing latte art on weekends. Comfortable on the cashier and handling customer complaints politely. Fluent in English and Bahasa Melayu.',
  },
  {
    id: 'stu-wei', name: 'Tan Wei Jie', email: 'weijie.tan@example.com', area: 'Bandar Sunway',
    campus: 'Sunway University', expectedRate: 12,
    skills: ['espresso', 'milk steaming', 'food handling', 'mandarin', 'english'],
    availability: { Sat: ['07:00-15:00'], Sun: ['07:00-15:00'], Fri: ['18:00-22:00'] },
    bio: 'Computer science student. Part-time barista at a chain coffee kiosk in Sunway Pyramid for 1 year: espresso, milk steaming and opening shifts. Holds a food handling certificate (typhoid jab done). Speaks Mandarin and English.',
  },
  {
    id: 'stu-priya', name: 'Priya Nair', email: 'priya.nair@example.com', area: 'Petaling Jaya',
    campus: 'Universiti Malaya', expectedRate: 13,
    skills: ['customer service', 'cashier', 'english', 'tamil', 'social media'],
    availability: { Sat: ['10:00-20:00'], Sun: ['12:00-20:00'] },
    bio: 'Marketing student. Worked as a retail assistant at a bookstore in Damansara Utama for 6 months handling the cashier and customer service. Runs the Instagram page for my faculty club. Fluent in English and Tamil. No barista experience yet but eager to learn.',
  },
  {
    id: 'stu-hafiz', name: 'Muhammad Hafiz', email: 'hafiz.m@example.com', area: 'Shah Alam',
    campus: 'UiTM Shah Alam', expectedRate: 10,
    skills: ['espresso', 'latte art', 'bahasa melayu', 'food handling'],
    availability: { Mon: ['09:00-17:00'], Tue: ['09:00-17:00'], Thu: ['09:00-17:00'] },
    bio: 'Culinary arts student. Did barista training and latte art at a cafe in Seksyen 7 during semester break. Has food handling certificate. Only free on weekdays because of family business on weekends.',
  },
  {
    id: 'stu-mei', name: 'Lim Mei Ling', email: 'meiling.lim@example.com', area: 'Subang Jaya',
    campus: 'Monash University Malaysia', expectedRate: 15,
    skills: ['tutoring', 'mathematics', 'physics', 'english', 'mandarin'],
    availability: { Sat: ['09:00-13:00'], Sun: ['09:00-13:00'], Tue: ['19:00-22:00'] },
    bio: 'Engineering student. Tutored SPM mathematics and physics to 6 secondary school students for 2 years, with 5 of them scoring A. Fluent in English and Mandarin.',
  },
  {
    id: 'stu-daniel', name: 'Daniel Wong', email: 'daniel.wong@example.com', area: 'Puchong',
    campus: 'Taylor\'s University', expectedRate: 12,
    skills: ['espresso', 'customer service', 'cashier', 'english', 'cantonese'],
    availability: { Sat: ['06:00-14:00'], Sun: ['06:00-14:00'] },
    bio: 'Business student. Barista at a family-run kopitiam turned cafe in Puchong for 2 years, handling espresso, the cashier and morning rush customer service. Speaks English and Cantonese.',
  },
  {
    id: 'stu-sarah', name: 'Sarah Lee', email: 'sarah.lee@example.com', area: 'Kuala Lumpur',
    campus: 'Sunway University', expectedRate: 14,
    skills: ['event crew', 'customer service', 'english', 'photography'],
    availability: { Fri: ['17:00-23:00'], Sat: ['10:00-23:00'], Sun: ['10:00-23:00'] },
    bio: 'Communication student. Event crew for 10+ concerts and product launches in KL handling ticketing and customer service. Also shoots event photography.',
  },
  {
    id: 'stu-arjun', name: 'Arjun Kumar', email: 'arjun.kumar@example.com', area: 'Cyberjaya',
    campus: 'Multimedia University', expectedRate: 18,
    skills: ['python', 'data entry', 'excel', 'web development', 'english'],
    availability: { Mon: ['18:00-23:00'], Wed: ['18:00-23:00'], Sat: ['09:00-17:00'] },
    bio: 'IT student. Freelanced data entry and Excel clean-up for 3 SMEs, built two small business websites, and writes Python scripts to automate reports.',
  },
  {
    id: 'stu-nurul', name: 'Nurul Izzah', email: 'nurul.izzah@example.com', area: 'Subang Jaya',
    campus: 'INTI International University', expectedRate: 11,
    skills: ['customer service', 'food handling', 'bahasa melayu', 'english', 'cashier'],
    availability: { Sat: ['09:00-17:00'], Sun: ['09:00-17:00'], Thu: ['14:00-20:00'] },
    bio: 'Accounting student. Waitress and cashier at a nasi lemak restaurant in USJ for a year, so I am used to fast customer service. Food handling certificate holder. Speaks Bahasa Melayu and English. Keen to learn espresso.',
  },
  {
    id: 'stu-kevin', name: 'Kevin Chong', email: 'kevin.chong@example.com', area: 'Petaling Jaya',
    campus: 'UCSI University', expectedRate: 12,
    skills: ['social media', 'canva', 'video editing', 'copywriting', 'english'],
    availability: { Tue: ['13:00-18:00'], Thu: ['13:00-18:00'], Sat: ['10:00-16:00'] },
    bio: 'Mass comm student. Manages TikTok and Instagram for two F&B brands, edits short videos with CapCut and designs posts in Canva. Grew one account from 800 to 6,000 followers.',
  },
  {
    id: 'stu-farah', name: 'Farah Aziz', email: 'farah.aziz@example.com', area: 'Bandar Sunway',
    campus: 'Sunway University', expectedRate: 12,
    skills: ['espresso', 'latte art', 'customer service', 'english', 'bahasa melayu'],
    availability: { Sat: ['12:00-20:00'], Sun: ['08:00-16:00'] },
    bio: 'Psychology student. Barista at a third-wave cafe in Sunway for 5 months, espresso and basic latte art, plus serving customers at the counter. English and Bahasa Melayu.',
  },
  {
    id: 'stu-jun', name: 'Ong Jun Hao', email: 'junhao.ong@example.com', area: 'Klang',
    campus: 'SEGi University', expectedRate: 11,
    skills: ['warehouse', 'driving license', 'mandarin', 'bahasa melayu'],
    availability: { Sat: ['08:00-18:00'], Sun: ['08:00-18:00'] },
    bio: 'Logistics student with a B2 motorcycle and D car driving license. Packed and dispatched e-commerce orders at a warehouse in Klang during holidays.',
  },
  {
    // Her drinks experience is written in her own words, not keywords: keyword rules miss it, a model reading the bio catches it.
    id: 'stu-chloe', name: 'Chloe Ng', email: 'chloe.ng@example.com', area: 'Cyberjaya',
    campus: 'Multimedia University', expectedRate: 12,
    skills: ['customer service', 'mandarin', 'english', 'bahasa melayu'],
    availability: { Sat: ['08:00-16:00'], Sun: ['08:00-16:00'] },
    bio: 'Diploma student. Worked a year at a bubble tea kiosk in Cyberjaya that also sells lattes: I pulled the shots, steamed the milk and poured hearts and rosettas on top. Took orders at the counter in Mandarin, Malay and English.',
  },
];

// Open gigs posted by other small businesses (for the student flow).
// Demo data: shop names are made up; role, area, pay and shift pattern are modelled on public
// part-time listings in the Klang Valley read on 10 Oct 2026 (see docs/demo-data.md).
const jobs = [
  {
    id: 'job-barista-sunway', business: 'Kopi Lane Sunway', ownerEmail: 'hello@kopilane.example.com',
    title: 'Weekend Barista', area: 'Bandar Sunway', pay: 12, payUnit: 'hour',
    schedule: { Sat: ['08:00-14:00'], Sun: ['08:00-14:00'] },
    requirements: ['espresso', 'customer service'], niceToHave: ['latte art'],
    description: 'Pull shots and run the counter during the weekend brunch rush near the Sunway campuses.', status: 'open', seed: true,
  },
  {
    id: 'job-crew-subang', business: 'Daily Grind SS15', ownerEmail: 'team@dailygrind.example.com',
    title: 'Front Service Crew (Barista)', area: 'Subang Jaya', pay: 10, payUnit: 'hour',
    schedule: { Wed: ['14:00-18:00'], Sat: ['09:00-17:00'], Sun: ['09:00-17:00'] },
    requirements: ['customer service', 'cashier'], niceToHave: ['espresso'],
    description: 'Take orders, handle the till and help on the coffee bar. Weekday and weekend shifts, public holidays too.', status: 'open', seed: true,
  },
  {
    id: 'job-cashier-usj', business: 'Roti Rumah USJ', ownerEmail: 'owner@rotirumah.example.com',
    title: 'Weekend Cashier', area: 'Subang Jaya', pay: 55, payUnit: 'day',
    schedule: { Sat: ['10:00-18:00'], Sun: ['10:00-18:00'] },
    requirements: ['cashier', 'customer service'], niceToHave: ['bahasa melayu'],
    description: 'Serve customers and run the till at a neighbourhood bakery on weekends and public holidays.', status: 'open', seed: true,
  },
  {
    id: 'job-retail-sunway', business: 'Threadline Sunway', ownerEmail: 'staff@threadline.example.com',
    title: 'Part-time Retail Assistant', area: 'Bandar Sunway', pay: 10, payUnit: 'hour',
    schedule: { Fri: ['18:00-22:00'], Sat: ['10:00-18:00'], Sun: ['10:00-18:00'] },
    requirements: ['customer service', 'cashier'], niceToHave: ['english', 'mandarin'],
    description: 'Help shoppers, restock shelves and take payments at a mall fashion store.', status: 'open', seed: true,
  },
  {
    id: 'job-kitchen-kl', business: 'Nasi & Co KL Sentral', ownerEmail: 'hr@nasiandco.example.com',
    title: 'Kitchen Helper / Waiter', area: 'Kuala Lumpur', pay: 10, payUnit: 'hour',
    schedule: { Sat: ['11:00-19:00'], Sun: ['11:00-19:00'] },
    requirements: ['food handling', 'customer service'], niceToHave: ['bahasa melayu'],
    description: 'Prep, serve and clear tables in a busy food court outlet. Rotating weekend and holiday shifts.', status: 'open', seed: true,
  },
  {
    id: 'job-fashion-kl', business: 'Mode Avenue', ownerEmail: 'people@modeavenue.example.com',
    title: 'Fashion Retail Ambassador', area: 'Kuala Lumpur', pay: 14, payUnit: 'hour',
    schedule: { Fri: ['14:00-22:00'], Sat: ['10:00-22:00'], Sun: ['10:00-22:00'] },
    requirements: ['customer service', 'english'], niceToHave: ['social media'],
    description: 'Style customers and keep the floor looking sharp. Three-to-five month contract, about 24 hours a week.', status: 'open', seed: true,
  },
  {
    id: 'job-promoter-kl', business: 'Brightside Events', ownerEmail: 'crew@brightside.example.com',
    title: 'Weekend Event Promoter', area: 'Kuala Lumpur', pay: 135, payUnit: 'day',
    schedule: { Sat: ['10:00-19:00'], Sun: ['10:00-19:00'] },
    requirements: ['customer service', 'event crew'], niceToHave: ['photography'],
    description: 'Promote travel packages at an exhibition booth in KL for a weekend fair.', status: 'open', seed: true,
  },
  {
    id: 'job-tutor-pj', business: 'Bright Minds Tuition', ownerEmail: 'hello@brightminds.example.com',
    title: 'Weekend Maths & Science Tutor', area: 'Petaling Jaya', pay: 40, payUnit: 'hour',
    schedule: { Sat: ['09:00-13:00'], Sun: ['09:00-13:00'] },
    requirements: ['tutoring', 'mathematics'], niceToHave: ['physics', 'english'],
    description: 'Teach small groups of secondary students maths and science on weekend mornings.', status: 'open', seed: true,
  },
  {
    id: 'job-data-sripetaling', business: 'Ledger Lite Accounting', ownerEmail: 'ops@ledgerlite.example.com',
    title: 'Part-time Data Entry Assistant', area: 'Sri Petaling', pay: 11, payUnit: 'hour',
    schedule: { Mon: ['18:00-22:00'], Wed: ['18:00-22:00'], Sat: ['09:00-13:00'] },
    requirements: ['data entry', 'excel'], niceToHave: ['python'],
    description: 'Key in and check invoices for small business clients. Evenings and Saturday mornings.', status: 'open', seed: true,
  },
];

module.exports = { students, jobs };
