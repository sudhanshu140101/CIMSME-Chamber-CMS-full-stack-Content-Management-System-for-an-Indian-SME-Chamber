# CIMSME Chamber CMS

**Full-stack Content Management System for the Chamber of Indian Micro, Small and Medium Enterprises (CIMSME).**

A complete CMS built for chamber/organization management — membership, events, committees, chapters, payments (Cashfree), email (Zeptomail), and admin panel.

🔗 **Live Website:** [https://indiansmechamber.com/](https://indiansmechamber.com/)

---

## 🚀 Features

- **Admin Panel** — Dashboard, event management, membership applications, content management
- **Membership** — Registration, plans, approval workflow, member login & dashboard
- **Events** — Conferences, webinars, agenda, speakers, registration, event photos & videos
- **Committees & Chapters** — Manage committees, chapter leaders, and regional chapters
- **Payments** — Cashfree integration for membership fees and event registration
- **Email** — Zeptomail for notifications and transactional emails
- **Security** — JWT authentication, bcrypt passwords, rate limiting, Helmet
- **Member Services** — Certificate download, profile, finance/legal/advisory service requests

---

## 🛠️ Tech Stack

| Layer      | Technology                          |
|-----------|--------------------------------------|
| Backend   | Node.js, Express.js                  |
| Database  | MySQL                                |
| Auth      | JWT (admin & member)                 |
| Payments  | Cashfree PG                          |
| Email     | Zeptomail                            |
| File      | Multer, Sharp (images)               |
| PDF       | pdf-lib, jsPDF                       |
| Frontend  | Vanilla HTML/CSS/JS                  |
| Optional  | Redis (sessions in production)      |

---

## 📁 Project Structure
├── server.js # Main Express app & API routes
├── package.json
├── .env.example # Environment template (copy to .env)
├── database/
│ └── schema-mysql.sql # MySQL schema
├── models/
│ └── database.js # DB connection & helpers
├── middleware/
│ ├── auth.middleware.js # JWT verify (admin/member)
│ └── upload.middleware.js
└── public/ # Static frontend
├── index.html
├── membership.html
├── admin/ # Admin dashboard & login
├── js/
└── assets/
## ⚙️ Setup & Run
### Prerequisites
-Node.js (>= 16)
- MySQL
- npm
### 1. Clone the repository

git clone https://github.com/sudhanshu140101/CIMSME-Chamber-CMS-full-stack-Content-Management-System-for-an-Indian-SME-Chamber.git
cd CIMSME-Chamber-CMS-full-stack-Content-Management-System-for-an-Indian-SME-Chamber
