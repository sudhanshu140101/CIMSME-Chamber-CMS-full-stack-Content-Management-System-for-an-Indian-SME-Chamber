SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";





CREATE TABLE hero (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(500),
    button_text VARCHAR(100),
    button_link VARCHAR(500),
    text_position VARCHAR(50) DEFAULT 'bottom-left',
    order_index INT DEFAULT 0,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active (is_active),
    INDEX idx_active_order (is_active, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Homepage hero/carousel slides';




CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time VARCHAR(50) DEFAULT '09:00 AM',
    location VARCHAR(255),
    event_type VARCHAR(100) DEFAULT 'conference',
    registration_fee DECIMAL(10,2) DEFAULT 0,
    max_participants INT DEFAULT 0 COMMENT '0 = unlimited',
    registration_enabled BOOLEAN DEFAULT true COMMENT 'Enable/disable registration form for this event',
    payment_link VARCHAR(500),
    image_url VARCHAR(500),
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_date (event_date),
    INDEX idx_active (is_active),
    INDEX idx_featured (is_featured),
    INDEX idx_active_date (is_active, event_date),
    INDEX idx_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Event management system';




CREATE TABLE event_agenda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    time VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    speaker VARCHAR(255),
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    INDEX idx_event (event_id),
    INDEX idx_event_order (event_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Event schedule/agenda items';




CREATE TABLE event_speakers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    bio TEXT,
    photo_url VARCHAR(500),
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    INDEX idx_event (event_id),
    INDEX idx_event_order (event_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Speakers for each event';




CREATE TABLE event_photos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    photo_url VARCHAR(500) NOT NULL,
    caption VARCHAR(255),
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    INDEX idx_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Event photo gallery';




CREATE TABLE event_videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    video_url VARCHAR(500) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    INDEX idx_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Event videos gallery';


--  EVENT REGISTRATIONS

CREATE TABLE event_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_id VARCHAR(50) UNIQUE NOT NULL,
    event_id INT,
    event_title VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    designation VARCHAR(255),
    num_participants INT DEFAULT 1,
    special_requirements TEXT,
    is_member BOOLEAN DEFAULT false,
    
    payment_status ENUM('pending','confirmed','failed','refunded') DEFAULT 'pending' NOT NULL,
    payment_confirmed BOOLEAN DEFAULT false,
    payment_confirmed_by VARCHAR(255),
    payment_confirmed_at DATETIME,
    
     attendance_status ENUM('registered','attended','absent') DEFAULT 'registered' NOT NULL,
    attendance_marked_at DATETIME,
    status ENUM('pending','confirmed','cancelled') DEFAULT 'pending' NOT NULL,
    
    qr_code VARCHAR(500),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_event (event_id),
    INDEX idx_email (email),
    INDEX idx_reg_id (registration_id),
    INDEX idx_payment (payment_confirmed),
    INDEX idx_event_payment (event_id, payment_confirmed),
    INDEX idx_attendance (attendance_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Event registration records';


--  ADVISORS 

CREATE TABLE advisors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    bio TEXT,
    initials VARCHAR(10),
    color_scheme VARCHAR(50) DEFAULT 'blue-600',
    photo_url VARCHAR(500),
    order_index INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    facebook_url VARCHAR(500) DEFAULT NULL COMMENT 'Facebook profile URL',
    instagram_url VARCHAR(500) DEFAULT NULL COMMENT 'Instagram profile URL',
    twitter_url VARCHAR(500) DEFAULT NULL COMMENT 'Twitter/X profile URL',
    youtube_url VARCHAR(500) DEFAULT NULL COMMENT 'YouTube channel URL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active (is_active),
    INDEX idx_featured (is_featured),
    INDEX idx_active_order (is_active, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Advisory board members';

-- 📰 NEWS TABLE

CREATE TABLE news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    photo_url VARCHAR(500) NOT NULL,
    published_date DATE NOT NULL,
    order_index INT DEFAULT 0,
    source_link_url VARCHAR(500) DEFAULT NULL COMMENT 'Optional URL to full article on external site',
    source_link_name VARCHAR(255) DEFAULT NULL COMMENT 'Display name for source link e.g. Read at BBC News',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_active (is_active),
    INDEX idx_published (published_date),
    INDEX idx_order (order_index),
    INDEX idx_active_published (is_active, published_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='News and announcements';

-- 💬 TESTIMONIALS TABLE

CREATE TABLE testimonials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    heading VARCHAR(255) NOT NULL,
    paragraph TEXT NOT NULL,
    photo_url VARCHAR(500) NOT NULL,
    order_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active (is_active),
    INDEX idx_order (order_index),
    INDEX idx_active_order (is_active, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Customer testimonials and reviews';


-- MEMBERSHIP APPLICATIONS 

   CREATE TABLE membership_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    memberid VARCHAR(50) UNIQUE NOT NULL,
    fullname VARCHAR(255) NOT NULL,
    businessname VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password VARCHAR(255) COMMENT 'Bcrypt hashed',
    
    businesstype VARCHAR(100),
    businesscategory VARCHAR(100) COMMENT 'micro, small, medium, listed',
    annualturnover DECIMAL(15,2),
    state VARCHAR(100),
    city VARCHAR(100),
    pincode VARCHAR(10),
    yearsinbusiness VARCHAR(50),
    businessaddress TEXT,
    udyamregistrationnumber VARCHAR(50) DEFAULT NULL,
    interested_community VARCHAR(255) DEFAULT NULL COMMENT 'Optional committee/community name from committees table',
    gstregistered BOOLEAN DEFAULT false,
    gsttype VARCHAR(50),
    
    membershipfee DECIMAL(10,2),
    originalfee DECIMAL(10,2),
    couponcode VARCHAR(50),
    discountamount DECIMAL(10,2) DEFAULT 0,
    finalamount DECIMAL(10,2),
    
    
    payment_status ENUM('pending','paid','failed') DEFAULT 'pending' NOT NULL,
        payment_order_id VARCHAR(100),  
        order_id VARCHAR(100),          
        paid_amount DECIMAL(10, 2),
        payment_date TIMESTAMP NULL,

   
    
    status ENUM('pending','approved','rejected') DEFAULT 'pending' NOT NULL,
    applicationdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approveddate TIMESTAMP NULL,
    rejecteddate TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    
    INDEX idx_email (email),
    INDEX idx_memberid (memberid),
    INDEX idx_status (status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_status_date (status, applicationdate),
    INDEX idx_businesscategory (businesscategory)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Member application records';


--  COUPONS 

CREATE TABLE coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INT NOT NULL DEFAULT 0 COMMENT 'DEPRECATED - use discount_type + discount_value',
    discount_type VARCHAR(50) DEFAULT 'percent' COMMENT 'percent or fixed',
    discount_value DECIMAL(10,2) COMMENT 'Percentage (0-100) or fixed amount',
    description VARCHAR(255),
    applies_to VARCHAR(50) DEFAULT 'membership' COMMENT 'membership, events, all',
    
    expiry_date DATE,
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    current_uses INT NOT NULL DEFAULT 0,
    
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_code (code),
    INDEX idx_active (is_active),
    INDEX idx_active_expiry (is_active, expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Discount coupon codes';


--  MEMBERSHIP BENEFITS

CREATE TABLE membership_benefits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    gradient_color VARCHAR(100),
    category VARCHAR(100) DEFAULT 'general',
    order_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active (is_active),
    INDEX idx_active_order (is_active, order_index),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Membership benefits/features';


-- MEMBERSHIP STORIES 

CREATE TABLE membership_stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    initials VARCHAR(10),
    business_type VARCHAR(255),
    location VARCHAR(255),
    testimonial TEXT NOT NULL,
    achievement VARCHAR(500),
    avatar_color VARCHAR(100),
    logo VARCHAR(500),
    display_order INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active (is_active),
    INDEX idx_featured (is_featured),
    INDEX idx_active_order (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Member success stories/testimonials';


--  MEMBER SERVICES (Support Requests)

CREATE TABLE member_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    memberid VARCHAR(50),
    member_email VARCHAR(255),
    member_name VARCHAR(255),
    business_name VARCHAR(255),
    service_type VARCHAR(50) NOT NULL COMMENT 'finance, legal, advisory, training, ipr',
    service_name VARCHAR(255),
    description TEXT,
    timeline VARCHAR(100),
    contact_number VARCHAR(20),
    status ENUM('Pending','In Progress','Completed','Rejected') DEFAULT 'Pending' NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_memberid (memberid),
    INDEX idx_email (member_email),
    INDEX idx_status (status),
    INDEX idx_type (service_type),
    INDEX idx_type_status (service_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Member service requests';


--  NEWSLETTER SUBSCRIBERS

CREATE TABLE newsletter (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('active','unsubscribed') DEFAULT 'active' NOT NULL,
    source VARCHAR(100) DEFAULT 'website' COMMENT 'website, import, api',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_active (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Newsletter email subscribers';


--  CONTACT SUBMISSIONS 

CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_read (is_read),
    INDEX idx_created (created_at),
    INDEX idx_email (email),
    INDEX idx_status_date (is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Contact form submissions';

CREATE TABLE payment_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(100) NOT NULL UNIQUE,
    cf_order_id VARCHAR(100) UNIQUE,
    payment_session_id TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    status ENUM('ACTIVE', 'PAID', 'EXPIRED', 'FAILED') DEFAULT 'ACTIVE',
    payment_method VARCHAR(50),
    membership_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_id (order_id),
    INDEX idx_cf_order_id (cf_order_id),
    INDEX idx_status (status),
    INDEX idx_customer_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Payment orders for Cashfree';

CREATE TABLE payment_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cf_payment_id VARCHAR(100) UNIQUE,
    order_id VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2),
    status ENUM('PENDING','SUCCESS','FAILED','CANCELLED') DEFAULT 'PENDING' NOT NULL,
    payment_method VARCHAR(100),
    bank_reference VARCHAR(255),
    payment_time TIMESTAMP NULL,
    webhook_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_id (order_id),
    INDEX idx_status (status),
    FOREIGN KEY (order_id) REFERENCES payment_orders(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Payment transaction records';




-- DEFAULT DATA


-- Sample hero slide
INSERT INTO hero (title, subtitle, button_text, button_link, is_active, order_index) VALUES
('Welcome to CIMSME', 'Chamber of Indian Micro, Small and Medium Enterprises', 'Join Now', '/membership', true, 1);

-- Sample advisor
INSERT INTO advisors (name, designation, bio, initials, color_scheme, is_active, order_index) VALUES
('Dr. Rajesh Kumar', 'Chairman & CEO', '25+ years of experience in MSME development and policy making.', 'RK', 'blue-600', true, 1);

-- Sample membership benefit
INSERT INTO membership_benefits (title, description, icon, category, order_index, is_active) VALUES
('Networking Opportunities', 'Connect with 10,000+ MSME members across India', 'users', 'networking', 1, true),
('Business Growth Support', 'Access to funding, mentorship, and growth programs', 'trending-up', 'growth', 2, true),
('Policy Advocacy', 'Represent your interests at state and national levels', 'shield', 'advocacy', 3, true);




SELECT '✓ Schema created successfully!' as status;

SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) AS 'Size (KB)'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'cimsme_cms'
ORDER BY TABLE_NAME;

