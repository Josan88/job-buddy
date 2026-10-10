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
];

// Open gigs posted by other small businesses (for the student flow).
const jobs = [
  {
    id: 'job-tutor-ss15', business: 'BrightPath Learning Centre', ownerEmail: 'hello@brightpath.example.com',
    title: 'Weekend SPM Maths Tutor', area: 'Subang Jaya', pay: 25, payUnit: 'hour',
    schedule: { Sat: ['09:00-12:00'], Sun: ['09:00-12:00'] },
    requirements: ['mathematics', 'tutoring'], niceToHave: ['physics', 'mandarin'],
    description: 'Teach small groups of 4 to 6 Form 4 and Form 5 students in SS15.', status: 'open',
  },
  {
    id: 'job-events-kl', business: 'Gather Events Sdn Bhd', ownerEmail: 'crew@gather.example.com',
    title: 'Concert Event Crew', area: 'Kuala Lumpur', pay: 15, payUnit: 'hour',
    schedule: { Fri: ['17:00-23:00'], Sat: ['15:00-23:00'] },
    requirements: ['customer service', 'event crew'], niceToHave: ['photography'],
    description: 'Ticket scanning, crowd guidance and merch booth at Bukit Jalil.', status: 'open',
  },
  {
    id: 'job-social-pj', business: 'Kopi Kaki PJ', ownerEmail: 'owner@kopikaki.example.com',
    title: 'Part-time Social Media Assistant', area: 'Petaling Jaya', pay: 14, payUnit: 'hour',
    schedule: { Tue: ['14:00-18:00'], Thu: ['14:00-18:00'] },
    requirements: ['social media', 'canva'], niceToHave: ['video editing', 'copywriting'],
    description: 'Plan and post 4 Instagram and TikTok posts a week for a neighbourhood cafe.', status: 'open',
  },
  {
    id: 'job-data-cyber', business: 'Lumen Accounting', ownerEmail: 'ops@lumen.example.com',
    title: 'Excel Data Entry Assistant', area: 'Cyberjaya', pay: 13, payUnit: 'hour',
    schedule: { Mon: ['18:00-22:00'], Wed: ['18:00-22:00'] },
    requirements: ['data entry', 'excel'], niceToHave: ['python'],
    description: 'Key in and reconcile invoices for SME clients, remote-friendly.', status: 'open',
  },
  {
    id: 'job-barista-sunway', business: 'Brew & Bloom Sunway', ownerEmail: 'manager@brewbloom.example.com',
    title: 'Weekend Barista', area: 'Bandar Sunway', pay: 12, payUnit: 'hour',
    schedule: { Sat: ['08:00-14:00'], Sun: ['08:00-14:00'] },
    requirements: ['espresso', 'customer service'], niceToHave: ['latte art'],
    description: 'Morning shifts at a busy brunch cafe near Sunway Lagoon.', status: 'open',
  },
  {
    id: 'job-cashier-usj', business: 'Mak Cik Bakery USJ', ownerEmail: 'makcik@bakery.example.com',
    title: 'Bakery Cashier (Weekends)', area: 'Subang Jaya', pay: 7, payUnit: 'hour',
    schedule: { Sat: ['10:00-16:00'], Sun: ['10:00-16:00'] },
    requirements: ['cashier', 'customer service'], niceToHave: ['bahasa melayu'],
    description: 'Serve customers and handle the till at a neighbourhood bakery.', status: 'open',
  },
];

module.exports = { students, jobs };
