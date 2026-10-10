// Demo data: student talent pool and a few open gigs around the Klang Valley.
// Emails use example.com so nothing real is ever sent to these people.

const seekers = [
  // Blind and low-vision job seekers (fictional people). needs = what the agent checks every job against.
  {
    id: 'stu-nadia', name: 'Nadia Rahim', email: 'nadia.rahim@example.com', area: 'Subang Jaya',
    campus: '', expectedRate: 12,
    skills: ['customer service', 'phone', 'typing', 'english', 'bahasa melayu', 'screen reader'],
    availability: { Mon: ['09:00-17:00'], Tue: ['09:00-17:00'], Wed: ['09:00-17:00'], Thu: ['09:00-17:00'], Fri: ['09:00-17:00'] },
    needs: { vision: 'blind', screenReader: true, tool: 'NVDA', maxWalkMin: 10, interviewFormat: 'phone', travel: 'LRT' },
    bio: 'I am blind and use the NVDA screen reader. I answered customer calls for a year at a phone banking hotline and type 60 words a minute in English and Bahasa Melayu.',
  },
  {
    id: 'stu-aqilah', name: 'Nur Aqilah', email: 'nur.aqilah@example.com', area: 'Cheras',
    campus: 'Universiti Kebangsaan Malaysia', expectedRate: 12,
    skills: ['copywriting', 'bahasa melayu', 'english', 'social media', 'typing'],
    availability: { Mon: ['10:00-18:00'], Wed: ['10:00-18:00'], Fri: ['10:00-18:00'] },
    needs: { vision: 'low vision', screenReader: false, magnification: true, tool: 'screen magnifier', remoteOnly: true, interviewFormat: 'video' },
    bio: 'I have low vision and use a screen magnifier at 300%. I write Bahasa Melayu captions and articles for my faculty magazine and run its Instagram page.',
  },
  {
    id: 'stu-ravi', name: 'Ravi Chandran', email: 'ravi.chandran@example.com', area: 'Kuala Lumpur',
    campus: '', expectedRate: 12,
    skills: ['massage', 'customer service', 'tamil', 'english', 'bahasa melayu'],
    availability: { Wed: ['11:00-19:00'], Thu: ['11:00-19:00'], Fri: ['11:00-19:00'], Sat: ['11:00-19:00'], Sun: ['11:00-19:00'] },
    needs: { vision: 'blind', screenReader: true, tool: 'TalkBack', maxWalkMin: 10, interviewFormat: 'in person', travel: 'LRT' },
    bio: 'I am blind and hold a certificate in therapeutic massage. I worked two years at a reflexology centre in Brickfields serving regular customers.',
  },
];

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

// Jobs suited to blind and low-vision workers (fictional employers; roles and pay are illustrative).
// access: workMode, nearest station and walking time, assistive tech the employer supports,
// tasks that need sight, interview formats offered and interview hours.
const WEEKDAYS = h => Object.fromEntries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => [d, [h]]));
const accessJobs = [
  {
    id: 'job-support-remote', business: 'TalkLine Support', ownerEmail: 'jobs@talkline.example.com',
    title: 'Customer Support Agent (Phone and Chat)', area: 'Petaling Jaya', pay: 11, payUnit: 'hour',
    schedule: WEEKDAYS('09:00-17:00'), requirements: ['customer service', 'phone'], niceToHave: ['bahasa melayu', 'english'],
    description: 'Answer customer calls and chats for a telco reseller from home. Laptop and headset provided. Training is by audio and screen-shared walkthroughs.',
    access: { workMode: 'remote', assistiveTech: ['NVDA', 'JAWS'], sightTasks: [], interviewFormats: ['phone', 'video'], interviewHours: WEEKDAYS('10:00-17:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-a11y-pj', business: 'Kodlab Studio', ownerEmail: 'hiring@kodlab.example.com',
    title: 'Accessibility Tester (Screen Reader)', area: 'Petaling Jaya', pay: 18, payUnit: 'hour',
    schedule: { Tue: ['10:00-16:00'], Thu: ['10:00-16:00'] }, requirements: ['screen reader', 'english'], niceToHave: ['web development'],
    description: 'Test client websites and apps with a screen reader and report what blocks you. Two days a week, one in the office.',
    access: { workMode: 'hybrid', transit: { station: 'Taman Paramount LRT', walkMin: 6 }, assistiveTech: ['NVDA', 'JAWS', 'VoiceOver'], sightTasks: [], interviewFormats: ['video', 'phone', 'in person'], interviewHours: WEEKDAYS('10:00-17:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-transcribe-remote', business: 'Suara Notes', ownerEmail: 'team@suaranotes.example.com',
    title: 'Audio Transcriber (Malay and English)', area: 'Kuala Lumpur', pay: 12, payUnit: 'hour',
    schedule: WEEKDAYS('09:00-18:00'), requirements: ['typing', 'bahasa melayu'], niceToHave: ['english'],
    description: 'Type up recorded interviews and meetings in Word from home. Flexible hours on weekdays.',
    access: { workMode: 'remote', assistiveTech: ['NVDA', 'JAWS'], sightTasks: [], interviewFormats: ['phone', 'video'], interviewHours: WEEKDAYS('09:00-17:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-telesales-subang', business: 'Prima Insure Agency', ownerEmail: 'hr@primainsure.example.com',
    title: 'Telesales Executive', area: 'Subang Jaya', pay: 10, payUnit: 'hour',
    schedule: WEEKDAYS('09:00-17:00'), requirements: ['phone', 'customer service'], niceToHave: ['bahasa melayu', 'mandarin'],
    description: 'Call existing customers about renewals from the Subang office. Basic pay plus commission.',
    access: { workMode: 'on-site', transit: { station: 'SS15 LRT', walkMin: 4 }, assistiveTech: ['JAWS'], sightTasks: [], interviewFormats: ['in person', 'phone'], interviewHours: WEEKDAYS('10:00-16:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-reception-sunway', business: 'Klinik Mesra Sunway', ownerEmail: 'admin@klinikmesra.example.com',
    title: 'Clinic Phone Receptionist', area: 'Bandar Sunway', pay: 12, payUnit: 'hour',
    schedule: WEEKDAYS('09:00-15:00'), requirements: ['phone', 'customer service'], niceToHave: ['bahasa melayu'],
    description: 'Answer the clinic phone line and book patient appointments in our online system.',
    access: { workMode: 'on-site', transit: { station: 'Sunway Lagoon BRT', walkMin: 5 }, assistiveTech: [], sightTasks: [], interviewFormats: ['in person'], interviewHours: WEEKDAYS('14:00-16:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-massage-kl', business: 'Tenang Wellness', ownerEmail: 'hello@tenang.example.com',
    title: 'Massage Therapist', area: 'Kuala Lumpur', pay: 12, payUnit: 'hour',
    schedule: { Wed: ['11:00-19:00'], Fri: ['11:00-19:00'], Sat: ['11:00-19:00'] }, requirements: ['massage'], niceToHave: ['customer service'],
    description: 'Give full-body and foot massages at a wellness centre in the city centre. Certificate required.',
    access: { workMode: 'on-site', transit: { station: 'Masjid Jamek LRT', walkMin: 5 }, computerWork: false, assistiveTech: [], sightTasks: [], interviewFormats: ['in person', 'phone'], interviewHours: { Wed: ['11:00-17:00'], Thu: ['11:00-17:00'], Fri: ['11:00-17:00'] } },
    status: 'open', seed: true,
  },
  {
    id: 'job-writer-remote', business: 'Cerita Digital', ownerEmail: 'editor@ceritadigital.example.com',
    title: 'Bahasa Melayu Content Writer', area: 'Cyberjaya', pay: 15, payUnit: 'hour',
    schedule: { Mon: ['10:00-16:00'], Wed: ['10:00-16:00'], Fri: ['10:00-16:00'] }, requirements: ['copywriting', 'bahasa melayu'], niceToHave: ['social media'],
    description: 'Write articles and social posts in Bahasa Melayu from home. Briefs arrive as Google Docs.',
    access: { workMode: 'remote', assistiveTech: ['NVDA', 'screen magnifier'], sightTasks: [], interviewFormats: ['video'], interviewHours: WEEKDAYS('10:00-17:00') },
    status: 'open', seed: true,
  },
  {
    id: 'job-delivery-subang', business: 'KedaiKita Grocer', ownerEmail: 'ops@kedaikita.example.com',
    title: 'Order Picker and Delivery Rider', area: 'Subang Jaya', pay: 11, payUnit: 'hour',
    schedule: WEEKDAYS('09:00-17:00'), requirements: ['customer service'], niceToHave: ['driving license'],
    description: 'Pick grocery orders from shelves and deliver them by motorcycle around Subang.',
    access: { workMode: 'on-site', transit: { station: 'SS15 LRT', walkMin: 8 }, computerWork: false, sightTasks: ['riding a motorcycle for deliveries', 'picking items by reading shelf labels'], interviewFormats: ['in person'], interviewHours: WEEKDAYS('10:00-16:00') },
    status: 'open', seed: true,
  },
];

// The original part-time jobs get the same access facts so every job can be checked.
const legacyAccess = {
  'job-barista-sunway': { workMode: 'on-site', transit: { station: 'Sunway Lagoon BRT', walkMin: 7 }, computerWork: false, sightTasks: ['reading printed order tickets'] },
  'job-crew-subang': { workMode: 'on-site', transit: { station: 'SS15 LRT', walkMin: 3 }, computerWork: false, sightTasks: ['reading the order screen'] },
  'job-cashier-usj': { workMode: 'on-site', transit: null, computerWork: false, sightTasks: [] },
  'job-retail-sunway': { workMode: 'on-site', transit: { station: 'Sunway Lagoon BRT', walkMin: 4 }, computerWork: false, sightTasks: ['checking price tags and restocking by label'] },
  'job-kitchen-kl': { workMode: 'on-site', transit: { station: 'KL Sentral', walkMin: 3 }, computerWork: false, sightTasks: ['clearing and serving tables in a crowded food court'] },
  'job-fashion-kl': { workMode: 'on-site', transit: { station: 'Bukit Bintang MRT', walkMin: 5 }, computerWork: false, sightTasks: ['styling outfits for customers'] },
  'job-promoter-kl': { workMode: 'on-site', transit: { station: 'Tun Razak Exchange MRT', walkMin: 10 }, computerWork: false, sightTasks: [] },
  'job-tutor-pj': { workMode: 'on-site', transit: { station: 'Taman Bahagia LRT', walkMin: 9 }, computerWork: false, sightTasks: ['marking handwritten worksheets'] },
  'job-data-sripetaling': { workMode: 'on-site', transit: { station: 'Sri Petaling LRT', walkMin: 6 }, assistiveTech: [], sightTasks: ['keying in figures from scanned paper invoices'] },
};
for (const j of jobs) j.access = { interviewFormats: ['in person', 'video'], ...legacyAccess[j.id] };

module.exports = { students: [...seekers, ...students], jobs: [...accessJobs, ...jobs] };
