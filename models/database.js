const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');


const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'cimsme_cms',
  user: process.env.DB_USER || 'root',          
  password: process.env.DB_PASSWORD || '808080',      
  waitForConnections: true,
  connectionLimit: 50, 
  queueLimit: 0,
  maxIdle: 10, 
  idleTimeout: 60000, 
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000 
});

class Database {
    // Test connection
    static async testConnection() {
        try {
            const connection = await pool.getConnection();
            console.log('MySQL database connected');
            connection.release();
            return true;
        } catch (error) {
            console.error('Database connection error:', error.message);
            return false;
        }
    }

   
        
      static async initializeTables() {
    try {
       
        await this.query(`
            CREATE TABLE IF NOT EXISTS hero (
                id INT PRIMARY KEY AUTO_INCREMENT,
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
            )
        `);

      
        await this.query(`
            CREATE TABLE IF NOT EXISTS events (
                id INT PRIMARY KEY AUTO_INCREMENT,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_date DATE NOT NULL,
                event_time VARCHAR(50) DEFAULT '09:00 AM',
                location VARCHAR(255),
                event_type VARCHAR(100) DEFAULT 'conference',
                registration_fee DECIMAL(10,2) DEFAULT 0,
                max_participants INT DEFAULT 0,
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
            )
        `);

        
        await this.query(`
            CREATE TABLE IF NOT EXISTS advisors (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                designation VARCHAR(255) NOT NULL,
                bio TEXT,
                initials VARCHAR(10),
                color_scheme VARCHAR(50) DEFAULT 'blue-600',
                photo_url VARCHAR(500),
                order_index INT DEFAULT 0,
                is_featured BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                facebook_url VARCHAR(500),
                instagram_url VARCHAR(500),
                twitter_url VARCHAR(500),
                youtube_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active),
                INDEX idx_featured (is_featured)
            )
        `);

        
        try {
            // Check which columns exist
            const columns = await this.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'advisors'
                AND COLUMN_NAME IN ('facebook_url', 'instagram_url', 'twitter_url', 'youtube_url')
            `);
            
            const existingColumns = columns.map(col => col.COLUMN_NAME);
            const socialMediaColumns = ['facebook_url', 'instagram_url', 'twitter_url', 'youtube_url'];
            let addedCount = 0;
            
            for (const col of socialMediaColumns) {
                if (!existingColumns.includes(col)) {
                    try {
                        await this.query(`ALTER TABLE advisors ADD COLUMN ${col} VARCHAR(500)`);
                        addedCount++;
                        console.log(`Added ${col} column to advisors table`);
                    } catch (e) {
                        console.log(`Could not add column ${col}:`, e.message);
                    }
                }
            }
            
            if (addedCount > 0) {
                console.log(`Added ${addedCount} social media column(s) to advisors table`);
            } else {
                console.log('Social media columns already exist in advisors table');
            }
        } catch (err) {
            console.log('Error checking/adding social media columns:', err.message);
        }

        try {
            const eventCols = await this.query(`SHOW COLUMNS FROM events`);
            const eventColumns = eventCols.map(col => col.Field);
            
            if (!eventColumns.includes('registration_enabled')) {
                await this.query(`
                    ALTER TABLE events 
                    ADD COLUMN registration_enabled BOOLEAN DEFAULT true 
                    COMMENT 'Enable/disable registration form for this event'
                    AFTER max_participants
                `);
                console.log('Added registration_enabled column to events table');
            } else {
                console.log('registration_enabled column already exists in events table');
            }
        } catch (err) {
            console.log('Events auto-migration error:', err.message);
        }

        
        try {
            const memberCols = await this.query(`SHOW COLUMNS FROM membership_applications`);
            const memberColumns = memberCols.map(col => col.Field);
            
            const paymentMigrations = [
                { 
                    column: 'payment_status', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN payment_status ENUM('pending','paid','failed') DEFAULT 'pending' NOT NULL AFTER finalamount` 
                },
                { 
                    column: 'payment_order_id', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN payment_order_id VARCHAR(100) AFTER payment_status` 
                },
                { 
                    column: 'order_id', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN order_id VARCHAR(100) AFTER payment_order_id` 
                },
                { 
                    column: 'paid_amount', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN paid_amount DECIMAL(10, 2) AFTER order_id` 
                },
                { 
                    column: 'payment_date', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN payment_date TIMESTAMP NULL AFTER paid_amount` 
                },
                { 
                    column: 'membershiptype', 
                    sql: `ALTER TABLE membership_applications ADD COLUMN membershiptype VARCHAR(50) NULL COMMENT 'annual, startup, lifetime, patron' AFTER payment_date` 
                }
            ];
            
            let addedCount = 0;
            for (const migration of paymentMigrations) {
                if (!memberColumns.includes(migration.column)) {
                    try {
                        await this.query(migration.sql);
                        addedCount++;
                        console.log(`Added ${migration.column} to membership_applications`);
                    } catch (e) {
                        console.log(`Could not add ${migration.column}:`, e.message);
                    }
                }
            }
            const optionalMigrations = [
                { column: 'interested_community', sql: `ALTER TABLE membership_applications ADD COLUMN interested_community VARCHAR(255) DEFAULT NULL AFTER udyamregistrationnumber` }
            ];
            for (const migration of optionalMigrations) {
                if (!memberColumns.includes(migration.column)) {
                    try {
                        await this.query(migration.sql);
                        addedCount++;
                        console.log(`Added ${migration.column} to membership_applications`);
                    } catch (e) {
                        console.log(`Could not add ${migration.column}:`, e.message);
                    }
                }
            }
            
            if (addedCount > 0) {
                console.log(`Added ${addedCount} payment column(s) to membership_applications`);
            } else {
                console.log('Payment columns already exist in membership_applications');
            }
        } catch (err) {
            console.log('Membership payment auto-migration error:', err.message);
        }

        await this.query(`
            CREATE TABLE IF NOT EXISTS news (
                id INT PRIMARY KEY AUTO_INCREMENT,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                photo_url VARCHAR(500) NOT NULL,
                published_date DATE NOT NULL,
                order_index INT DEFAULT 0,
                source_link_url VARCHAR(500) DEFAULT NULL,
                source_link_name VARCHAR(255) DEFAULT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active),
                INDEX idx_published (published_date),
                INDEX idx_order (order_index)
            )
        `);
        await this.ensureNewsLinkColumns();

        await this.query(`
            CREATE TABLE IF NOT EXISTS testimonials (
                id INT PRIMARY KEY AUTO_INCREMENT,
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
            )
        `);

       
        await this.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                id INT PRIMARY KEY AUTO_INCREMENT,
                code VARCHAR(50) UNIQUE NOT NULL,
                discount_percent INT NOT NULL DEFAULT 0,
                discount_type VARCHAR(50) DEFAULT 'percent',
                discount_value DECIMAL(10,2),
                description VARCHAR(255),
                applies_to VARCHAR(50) DEFAULT 'membership',
                expiry_date DATE,
                valid_from DATE,
                valid_until DATE,
                min_amount DECIMAL(10,2),
                max_uses INT,
                used_count INT NOT NULL DEFAULT 0,
                current_uses INT NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_code (code),
                INDEX idx_active (is_active)
            )
        `);

        
        await this.query(`
            CREATE TABLE IF NOT EXISTS newsletter (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(255) UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                source VARCHAR(100) DEFAULT 'website',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_status (status)
            )
        `);

      
        await this.query(`
            CREATE TABLE IF NOT EXISTS event_registrations (
                id INT PRIMARY KEY AUTO_INCREMENT,
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
                payment_status VARCHAR(50) DEFAULT 'pending',
                payment_confirmed BOOLEAN DEFAULT false,
                payment_confirmed_by VARCHAR(255),
                payment_confirmed_at DATETIME,
                attendance_status VARCHAR(50) DEFAULT 'registered',
                attendance_marked_at DATETIME,
                status VARCHAR(50) DEFAULT 'pending',
                qr_code VARCHAR(500),
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                email_sent BOOLEAN DEFAULT false,
                email_sent_at TIMESTAMP NULL,
                INDEX idx_event (event_id),
                INDEX idx_email (email),
                INDEX idx_reg_id (registration_id),
                INDEX idx_payment (payment_confirmed)
            )
        `);

       
        // SUBMISSIONS 
       
        await this.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                subject VARCHAR(255),
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_read (is_read),
                INDEX idx_created (created_at)
            )
        `);

        

// PAYMENT ORDERS TABLE
await this.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
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
        INDEX idx_email (customer_email)
    )
`);

console.log('Payment orders table ready');


// PAYMENT TRANSACTIONS TABLE
await this.query(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
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
        INDEX idx_cf_payment_id (cf_payment_id),
        INDEX idx_status (status),
        FOREIGN KEY (order_id) REFERENCES payment_orders(order_id) ON DELETE CASCADE
    )
`);

console.log('Payment transactions table ready');




        
        // EVENT AGENDA 
      
        await this.query(`
            CREATE TABLE IF NOT EXISTS event_agenda (
                id INT PRIMARY KEY AUTO_INCREMENT,
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
            )
        `);

     
        // EVENT SPEAKERS 
      
        await this.query(`
            CREATE TABLE IF NOT EXISTS event_speakers (
                id INT PRIMARY KEY AUTO_INCREMENT,
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
            )
        `);

         
        // EVENT PHOTOS
         
        await this.query(`
            CREATE TABLE IF NOT EXISTS event_photos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                event_id INT NOT NULL,
                photo_url VARCHAR(500) NOT NULL,
                caption VARCHAR(255),
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                INDEX idx_event (event_id)
            )
        `);

        // EVENT VIDEOS TABLE
        await this.query(`
            CREATE TABLE IF NOT EXISTS event_videos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                event_id INT NOT NULL,
                video_url VARCHAR(500) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                order_index INT DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                INDEX idx_event (event_id),
                INDEX idx_active (is_active)
            )
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS footer_pdf (
                id INT PRIMARY KEY DEFAULT 1,
                title VARCHAR(255) NOT NULL DEFAULT 'CIMSME Presentation',
                pdf_url VARCHAR(1000) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await this.query(`INSERT IGNORE INTO footer_pdf (id, title) VALUES (1, 'CIMSME Presentation')`);

        // COMMITTEES
        await this.query(`
            CREATE TABLE IF NOT EXISTS committees (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                photo_url VARCHAR(500),
                overview TEXT,
                apply_link VARCHAR(500) DEFAULT '/membership',
                order_index INT DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active),
                INDEX idx_order (order_index)
            )
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS committee_leaders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                committee_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                position VARCHAR(255) NOT NULL,
                photo_url VARCHAR(500),
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
                INDEX idx_committee (committee_id)
            )
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS committee_subleaders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                committee_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                position VARCHAR(255) NOT NULL,
                photo_url VARCHAR(500),
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
                INDEX idx_committee (committee_id)
            )
        `);

        // CHAPTERS (same structure as committees)
        await this.query(`
            CREATE TABLE IF NOT EXISTS chapters (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                photo_url VARCHAR(500),
                overview TEXT,
                apply_link VARCHAR(500) DEFAULT '/membership',
                order_index INT DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active),
                INDEX idx_order (order_index)
            )
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS chapter_leaders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                chapter_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                position VARCHAR(255) NOT NULL,
                photo_url VARCHAR(500),
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
                INDEX idx_chapter (chapter_id)
            )
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS chapter_subleaders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                chapter_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                position VARCHAR(255) NOT NULL,
                photo_url VARCHAR(500),
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
                INDEX idx_chapter (chapter_id)
            )
        `);

        console.log('Database tables initialized');
        return true;
    } catch (error) {
        console.error('Table initialization error:', error.message);
        return false;
    }
}



        static async createMembershipTables() {
  try {
    // membership_applications
    await this.query(`
        CREATE TABLE IF NOT EXISTS membership_applications (
          id INT PRIMARY KEY AUTO_INCREMENT,
          memberid VARCHAR(50) UNIQUE NOT NULL,
          fullname VARCHAR(255) NOT NULL,
          businessname VARCHAR(255),
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(20) NOT NULL,
          password VARCHAR(255) COMMENT 'Bcrypt hashed',
          businesstype VARCHAR(100),
          subbusinesscategory VARCHAR(255) DEFAULT '',
          businesscategory VARCHAR(100) COMMENT 'micro, small, medium, listed',
          annualturnover DECIMAL(15,2),
          state VARCHAR(100),
          city VARCHAR(100),
          pincode VARCHAR(10),
          yearsinbusiness VARCHAR(50),
          udyamregistrationnumber VARCHAR(50) DEFAULT NULL,
          interested_community VARCHAR(255) DEFAULT NULL,
          businessaddress TEXT,
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
          membershiptype VARCHAR(50) NULL COMMENT 'annual, startup, lifetime, patron',
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
        )
      `);

    // membership_benefits 
    await this.query(`
      CREATE TABLE IF NOT EXISTS membership_benefits (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        gradient_color VARCHAR(100),
        category VARCHAR(100) DEFAULT 'general',
        order_index INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // membership_stories 
    await this.query(`
      CREATE TABLE IF NOT EXISTS membership_stories (
        id INT PRIMARY KEY AUTO_INCREMENT,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // member_services 
    await this.query(`
      CREATE TABLE IF NOT EXISTS member_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        memberid VARCHAR(50),
        member_email VARCHAR(255),
        member_name VARCHAR(255),
        business_name VARCHAR(255),
        service_type VARCHAR(50) NOT NULL,
        service_name VARCHAR(255),
        description TEXT,
        timeline VARCHAR(100),
        contact_number VARCHAR(20),
        status VARCHAR(50) DEFAULT 'Pending',
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS member_serial (
        id INT PRIMARY KEY DEFAULT 1,
        next_val INT NOT NULL DEFAULT 1
      )
    `);
    await this.query(`INSERT IGNORE INTO member_serial (id, next_val) VALUES (1, 1)`);

    await this.query(`
      CREATE TABLE IF NOT EXISTS member_serial_by_year (
        year INT PRIMARY KEY,
        next_val INT NOT NULL DEFAULT 1
      )
    `);

    try {
      await this.query('ALTER TABLE membership_applications ADD COLUMN subbusinesscategory VARCHAR(255) DEFAULT "" AFTER businesstype');
    } catch (e) {
      if (e.message && !e.message.includes('Duplicate column')) throw e;
    }
    try {
      await this.query('ALTER TABLE membership_applications ADD COLUMN udyamregistrationnumber VARCHAR(50) DEFAULT NULL AFTER yearsinbusiness');
    } catch (e) {
      if (e.message && !e.message.includes('Duplicate column')) throw e;
    }
    console.log('Membership tables ready');
    return true;
  } catch (error) {
    console.error('Membership tables error:', error.message);
    return false;
  }
}



    static async getFooterPdf() {
        try {
            const rows = await this.query('SELECT title, pdf_url, updated_at FROM footer_pdf WHERE id = 1 LIMIT 1');
            return rows[0] || null;
        } catch (err) {
            console.error('getFooterPdf error:', err.message);
            throw err;
        }
    }

    static async upsertFooterPdf(title, pdfUrl) {
        try {
            const sql = `INSERT INTO footer_pdf (id, title, pdf_url) VALUES (1, ?, ?)
                ON DUPLICATE KEY UPDATE title = VALUES(title), pdf_url = VALUES(pdf_url), updated_at = CURRENT_TIMESTAMP`;
            await this.query(sql, [title || 'CIMSME Presentation', pdfUrl || null]);
            return true;
        } catch (err) {
            console.error('upsertFooterPdf error:', err.message);
            throw err;
        }
    }

    static validateTableName(tableName) {
        const ALLOWED_TABLES = [
            'hero', 'events', 'advisors', 'news', 'testimonials', 'coupons', 'newsletter',
            'submissions', 'membership_applications', 'membership_benefits',
            'membership_stories', 'member_services', 'event_registrations',
            'event_agenda', 'event_speakers', 'event_photos', 'event_videos',
            'payment_orders', 'payment_transactions', 'committees', 'committee_leaders', 'committee_subleaders', 'chapters', 'chapter_leaders', 'chapter_subleaders', 'footer_pdf'
        ];
        if (!ALLOWED_TABLES.includes(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
        return true;
    }

    static async query(sql, params = []) {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('Query error:', error.message);
            throw error;
        }
    }

    static async getAll(tableName) {
        this.validateTableName(tableName);
        const sql = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;
        return await this.query(sql);
    }

    static async create(tableName, data) {
        try {
            this.validateTableName(tableName);
            const fields = Object.keys(data);
            const values = Object.values(data);
            const placeholders = fields.map(() => '?').join(', ');
            
            const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
            
            const result = await this.query(sql, values);
            return result.insertId;
        } catch (error) {
            console.error(`Error creating ${tableName}:`, error.message);
            throw error;
        }
    }

    static async update(tableName, id, data) {
        try {
            this.validateTableName(tableName);
            const fields = Object.keys(data);
            const values = Object.values(data);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            
            const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
            
            const result = await this.query(sql, [...values, id]);
            return true;
        } catch (error) {
            console.error(`Error updating ${tableName}:`, error.message);
            throw error;
        }
    }

    static async delete(tableName, id) {
        try {
            this.validateTableName(tableName);
            const sql = `DELETE FROM ${tableName} WHERE id = ?`;
            await this.query(sql, [id]);
            return true;
        } catch (error) {
            console.error(`Error deleting from ${tableName}:`, error.message);
            return false;
        }
    }

    static async getById(tableName, id) {
        this.validateTableName(tableName);
        const sql = `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`;
        const result = await this.query(sql, [id]);
        return result[0] || null;
    }

    // EVENT OPERATIONS
    static async getAllEvents() {
        return await this.getAll('events');
    }

    static async getEventById(id) {
        return await this.getById('events', id);
    }

    static async createEvent(data) {
        return await this.create('events', data);
    }

    static async updateEvent(id, data) {
        return await this.update('events', id, data);
    }

    static async deleteEvent(id) {
        return await this.delete('events', id);
    }

    static async toggleEventActive(id) {
        const sql = `UPDATE events SET is_active = NOT is_active WHERE id = ?`;
        await this.query(sql, [id]);
        
        const event = await this.getEventById(id);
        return { success: true, is_active: event?.is_active };
    }

    // EVENT REGISTRATIONS
    static async getAllEventRegistrations(eventId = null) {
        if (eventId) {
            const sql = 'SELECT * FROM event_registrations WHERE event_id = ? ORDER BY registered_at DESC';
            return await this.query(sql, [eventId]);
        } else {
            const sql = 'SELECT * FROM event_registrations ORDER BY registered_at DESC';
            return await this.query(sql);
        }
    }

     static async createEventRegistration(data) {
  const registrationId = this.generateRegistrationId();
  const qrCode = this.generateQRCode(registrationId);
  
  const sql = `
    INSERT INTO event_registrations (
      registration_id, event_id, event_title, full_name, email, phone,
      company_name, designation, num_participants, special_requirements,
      is_member, qr_code, payment_status, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  
  const values = [
    registrationId,
    data.event_id,
    data.event_title,
    data.full_name,
    data.email,
    data.phone,
    data.company_name || '',
    data.designation || '',
    data.num_participants || 1,
    data.special_requirements || '',
    data.is_member || false,
    qrCode,
    data.payment_status || 'pending'
  ];
  
  try {
    await this.query(sql, values);
    
    // Get the created registration
    const registration = await this.query(
      'SELECT * FROM event_registrations WHERE registration_id = ?',
      [registrationId]
    );
    
    console.log('  Registration created:', registrationId);
    return registration[0];
  } catch (error) {
    console.error(' createEventRegistration error:', error);
    throw error;
  }
}




    static generateRegistrationId() {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `REG-${dateStr}-${randomStr}`;
    }

    static generateQRCode(registrationId) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${registrationId}`;
    }

    static async confirmEventRegistrationPayment(registrationId, adminEmail) {
        const sql = `
            UPDATE event_registrations
            SET payment_status = 'confirmed',
                payment_confirmed = true,
                payment_confirmed_by = ?,
                payment_confirmed_at = NOW(),
                status = 'confirmed'
            WHERE registration_id = ?
        `;
        
        await this.query(sql, [adminEmail, registrationId]);
        
        const registration = await this.query(
            'SELECT * FROM event_registrations WHERE registration_id = ?',
            [registrationId]
        );
        
        if (registration.length > 0) {
            return { success: true, registration: registration[0] };
        }
        return { success: false, message: 'Registration not found' };
    }

    static async getEventRegistrationByRegId(registrationId) {
        const sql = 'SELECT * FROM event_registrations WHERE registration_id = ? LIMIT 1';
        const result = await this.query(sql, [registrationId]);
        return result[0] || null;
    }

    static async markAttendance(id, status) {
        const sql = `UPDATE event_registrations SET attendance_status = ?, attendance_marked_at = NOW() WHERE id = ?`;
        await this.query(sql, [status, id]);
        return true;
    }

    static async markEventRegistrationEmailSent(registrationId) {
        const sql = `UPDATE event_registrations SET email_sent = true, email_sent_at = NOW() WHERE registration_id = ?`;
        await this.query(sql, [registrationId]);
        return true;
    }

// EVENT AGENDA METHODS


static async getEventAgenda(eventId) {
    const sql = 'SELECT * FROM event_agenda WHERE event_id = ? ORDER BY order_index ASC';
    return await this.query(sql, [eventId]);
}

static async createAgendaItem(data) {
    return await this.create('event_agenda', data);
}

static async deleteAgendaItem(id) {
    return await this.delete('event_agenda', id);
}


// EVENT SPEAKERS METHODS


static async getEventSpeakers(eventId) {
    const sql = 'SELECT * FROM event_speakers WHERE event_id = ? ORDER BY order_index ASC';
    return await this.query(sql, [eventId]);
}

static async createSpeaker(data) {
    return await this.create('event_speakers', data);
}

static async deleteSpeaker(id) {
    return await this.delete('event_speakers', id);
}


// EVENT PHOTOS METHODS

static async getEventPhotos(eventId) {
    const sql = 'SELECT * FROM event_photos WHERE event_id = ? ORDER BY created_at DESC';
    return await this.query(sql, [eventId]);
}

static async createEventPhoto(data) {
    return await this.create('event_photos', data);
}

static async deleteEventPhoto(id) {
    return await this.delete('event_photos', id);
}

// EVENT VIDEOS METHODS
static async getEventVideos(eventId) {
    const sql = 'SELECT * FROM event_videos WHERE event_id = ? ORDER BY created_at DESC';
    return await this.query(sql, [eventId]);
}

static async createEventVideo(data) {
    return await this.create('event_videos', data);
}

static async getEventVideoById(id) {
    const sql = 'SELECT * FROM event_videos WHERE id = ?';
    const results = await this.query(sql, [id]);
    return results[0];
}

static async updateEventVideo(id, data) {
    return await this.update('event_videos', id, data);
}

static async deleteEventVideo(id) {
    return await this.delete('event_videos', id);
}

// MEMBERSHIP BENEFITS METHODS


static async getAllBenefits() {
    const sql = 'SELECT * FROM membership_benefits WHERE is_active = true ORDER BY order_index ASC';
    return await this.query(sql);
}

static async createBenefit(data) {
    return await this.create('membership_benefits', data);
}

static async updateBenefit(id, data) {
    return await this.update('membership_benefits', id, data);
}

static async deleteBenefit(id) {
    return await this.delete('membership_benefits', id);
}


// MEMBERSHIP STORIES METHODS


static async getAllStories() {
    const sql = 'SELECT * FROM membership_stories WHERE is_active = true ORDER BY display_order ASC';
    return await this.query(sql);
}

static async createStory(data) {
    return await this.create('membership_stories', data);
}

static async updateStory(id, data) {
    return await this.update('membership_stories', id, data);
}

static async deleteStory(id) {
    return await this.delete('membership_stories', id);
}




static async beginTransaction() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

static async commitTransaction(connection) {
  if (connection) {
    await connection.commit();
    connection.release();
  }
}

static async rollbackTransaction(connection) {
  if (connection) {
    await connection.rollback();
    connection.release();
  }
}


static async createMembershipWithTransaction(memberData, couponCode = null) {
  const connection = await this.beginTransaction();

  try {
    // 1. Insert membership application
    const [result] = await connection.execute(
      `INSERT INTO membership_applications (
         memberid, fullname, businessname, email, phone,
         businesstype, businesscategory, annualturnover,
         state, city, pincode, businessaddress,
         membershipfee, originalfee, couponcode,
         discountamount, finalamount, status, applicationdate
       ) VALUES (
         ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, 'pending', NOW()
       )`,
      [
        memberData.memberid,
        memberData.fullname,
        memberData.businessname || '',
        memberData.email,
        memberData.phone,
        memberData.businesstype || '',
        memberData.businesscategory || '',
        memberData.annualturnover || 0,
        memberData.state || '',
        memberData.city || '',
        memberData.pincode || '',
        memberData.businessaddress || '',
        memberData.membershipfee || 0,
        memberData.originalfee || memberData.membershipfee || 0,
        couponCode || null,
        memberData.discountamount || 0,
        memberData.finalamount || memberData.membershipfee || 0
      ]
    );

    // 2. Update coupon usage if applicable
    if (couponCode) {
      await connection.execute(
        `UPDATE coupons
         SET current_uses = current_uses + 1
         WHERE code = ? AND is_active = 1`,
        [couponCode]
      );
    }

    await this.commitTransaction(connection);
    return result.insertId;
  } catch (error) {
    await this.rollbackTransaction(connection);
    throw error;
  }
}

static async getNextMemberSerial() {
  const connection = await this.beginTransaction();
  try {
    const [rows] = await connection.execute(
      'SELECT next_val FROM member_serial WHERE id = 1 FOR UPDATE'
    );
    if (!rows || rows.length === 0) {
      await connection.execute(
        'INSERT INTO member_serial (id, next_val) VALUES (1, 1) ON DUPLICATE KEY UPDATE next_val = next_val'
      );
      const [r] = await connection.execute(
        'SELECT next_val FROM member_serial WHERE id = 1 FOR UPDATE'
      );
      const cur = r && r[0] ? Number(r[0].next_val) : 1;
      await connection.execute('UPDATE member_serial SET next_val = next_val + 1 WHERE id = 1');
      await this.commitTransaction(connection);
      return cur;
    }
    const cur = Number(rows[0].next_val);
    await connection.execute('UPDATE member_serial SET next_val = next_val + 1 WHERE id = 1');
    await this.commitTransaction(connection);
    return cur;
  } catch (error) {
    await this.rollbackTransaction(connection);
    throw error;
  }
}


static async getNextMemberSerialForYear(year) {
  const connection = await this.beginTransaction();
  try {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      await this.rollbackTransaction(connection);
      throw new Error(`Invalid year for member serial: ${year}`);
    }
    await connection.execute(
      'INSERT INTO member_serial_by_year (year, next_val) VALUES (?, 1) ON DUPLICATE KEY UPDATE year = year',
      [y]
    );
    const [rows] = await connection.execute(
      'SELECT next_val FROM member_serial_by_year WHERE year = ? FOR UPDATE',
      [y]
    );
    const cur = rows && rows[0] ? Number(rows[0].next_val) : 1;
    await connection.execute(
      'UPDATE member_serial_by_year SET next_val = next_val + 1 WHERE year = ?',
      [y]
    );
    await this.commitTransaction(connection);
    return cur;
  } catch (error) {
    await this.rollbackTransaction(connection);
    throw error;
  }
}

// Get approved member by memberid
static async getApprovedMemberById(memberid) {
  const sql = `
    SELECT *
    FROM membership_applications
    WHERE memberid = ? AND status = 'approved'
    LIMIT 1
  `;
  const rows = await this.query(sql, [memberid]);
  return rows[0] || null;
}


static async getEventRegistrationsByEmail(email) {
  const sql = `
    SELECT *
    FROM event_registrations
    WHERE LOWER(email) = LOWER(?)
    ORDER BY registered_at DESC
  `;
  return await this.query(sql, [email]);
}




    // HERO OPERATIONS
    static async getAllHero() {
        return await this.getAll('hero');
    }

    static async createHero(data) {
        return await this.create('hero', data);
    }

    static async updateHero(id, data) {
        return await this.update('hero', id, data);
    }

    static async deleteHero(id) {
        return await this.delete('hero', id);
    }

    // ADVISORS
    static async getAllAdvisors() {
        return await this.getAll('advisors');
    }

    static async createAdvisor(data) {
        return await this.create('advisors', data);
    }

    static async updateAdvisor(id, data) {
        return await this.update('advisors', id, data);
    }

    static async deleteAdvisor(id) {
        return await this.delete('advisors', id);
    }

    static async toggleAdvisorActive(id) {
        const sql = `UPDATE advisors SET is_active = NOT is_active WHERE id = ?`;
        await this.query(sql, [id]);
        
        const advisor = await this.getById('advisors', id);
        return { success: true, is_active: advisor?.is_active };
    }

    // NEWS
    static async getAllNews() {
        return await this.getAll('news');
    }

    static async createNews(data) {
        return await this.create('news', data);
    }

    static async updateNews(id, data) {
        return await this.update('news', id, data);
    }

    static async deleteNews(id) {
        return await this.delete('news', id);
    }

    static async toggleNewsActive(id) {
        const sql = `UPDATE news SET is_active = NOT is_active WHERE id = ?`;
        await this.query(sql, [id]);

        const news = await this.getById('news', id);
        return { success: true, is_active: news?.is_active };
    }

    static async ensureNewsLinkColumns() {
        try {
            const rows = await this.query(
                `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news' AND COLUMN_NAME = 'source_link_url'`
            );
            if (rows && rows[0] && rows[0].cnt === 0) {
                await this.query(`ALTER TABLE news 
                    ADD COLUMN source_link_url VARCHAR(500) DEFAULT NULL AFTER order_index,
                    ADD COLUMN source_link_name VARCHAR(255) DEFAULT NULL AFTER source_link_url`);
            }
        } catch (err) {
            console.warn('News link columns migration (non-fatal):', err.message);
        }
    }

    // TESTIMONIALS
    static async getAllTestimonials() {
        return await this.getAll('testimonials');
    }

    static async createTestimonial(data) {
        return await this.create('testimonials', data);
    }

    static async updateTestimonial(id, data) {
        return await this.update('testimonials', id, data);
    }

    static async deleteTestimonial(id) {
        return await this.delete('testimonials', id);
    }

    static async toggleTestimonialActive(id) {
        const sql = `UPDATE testimonials SET is_active = NOT is_active WHERE id = ?`;
        await this.query(sql, [id]);
        
        const testimonial = await this.getById('testimonials', id);
        return { success: true, is_active: testimonial?.is_active };
    }

    // COUPONS
    static async getAllCoupons() {
        return await this.getAll('coupons');
    }

    static async getCouponByCode(code) {
        const sql = 'SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) LIMIT 1';
        const result = await this.query(sql, [code]);
        return result[0] || null;
    }

    static async createCoupon(data) {
        return await this.create('coupons', data);
    }

    static async updateCoupon(id, data) {
        return await this.update('coupons', id, data);
    }

    static async deleteCoupon(id) {
        return await this.delete('coupons', id);
    }
     static async toggleCouponStatus(id) {
        const sql = `
            UPDATE coupons
            SET is_active = NOT is_active
            WHERE id = ?
        `;
        await this.query(sql, [id]);

        const coupon = await this.getById('coupons', id);
        return coupon;
        }   


    // NEWSLETTER
    static async getAllNewsletter() {
        return await this.getAll('newsletter');
    }

    static async createNewsletterSubscription(data) {
        return await this.create('newsletter', data);
    }

    static async deleteNewsletterSubscription(id) {
        return await this.delete('newsletter', id);
    }

    // SUBMISSIONS
    static async getAllSubmissions() {
        return await this.getAll('submissions');
    }

    static async createSubmission(data) {
        return await this.create('submissions', data);
    }

    static async deleteSubmission(id) {
        return await this.delete('submissions', id);
    }

    // DASHBOARD STATS
    static async getDashboardStats() {
        try {
            const stats = {};
            
            const apps = await this.query('SELECT COUNT(*) as count FROM membership_applications');
            stats.totalApplications = parseInt(apps[0].count);
            
            const pending = await this.query("SELECT COUNT(*) as count FROM membership_applications WHERE status = 'pending'");
            stats.pendingApplications = parseInt(pending[0].count);
            
            const approved = await this.query("SELECT COUNT(*) as count FROM membership_applications WHERE status = 'approved'");
            stats.approvedApplications = parseInt(approved[0].count);
            
            const events = await this.query('SELECT COUNT(*) as count FROM events');
            stats.totalEvents = parseInt(events[0].count);
            
            const activeEvents = await this.query('SELECT COUNT(*) as count FROM events WHERE is_active = true');
            stats.activeEvents = parseInt(activeEvents[0].count);
            
            const regs = await this.query('SELECT COUNT(*) as count FROM event_registrations');
            stats.totalRegistrations = parseInt(regs[0].count);
            
            const newsletter = await this.query('SELECT COUNT(*) as count FROM newsletter');
            stats.totalNewsletterSubscribers = parseInt(newsletter[0].count);
            
            const todayApps = await this.query("SELECT COUNT(*) as count FROM membership_applications WHERE DATE(created_at) = CURDATE()");
            stats.applicationsToday = parseInt(todayApps[0].count);
            
            return stats;
        } catch (error) {
            console.error(' Dashboard stats error:', error);
            return {};
        }
    }


    // USER OPERATIONS
    static async getUserByEmail(email) {
        const sql = 'SELECT * FROM membership_applications WHERE email = ? AND status = ? LIMIT 1';
        const result = await this.query(sql, [email.toLowerCase(), 'approved']);
        return result[0] || null;
    }

    static async getAllUsers() {
        const sql = 'SELECT * FROM membership_applications WHERE status = ?';
        return await this.query(sql, ['approved']);
    }
    
 static async createPaymentOrder(orderData) {
        try {
            const sql = `
                INSERT INTO payment_orders (
                    order_id, amount, currency, customer_name, 
                    customer_email, customer_phone, membership_data, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `;
            
            const [result] = await pool.execute(sql, [
                orderData.order_id,
                orderData.amount,
                orderData.currency || 'INR',
                orderData.customer_name,
                orderData.customer_email,
                orderData.customer_phone,
                JSON.stringify(orderData.membership_data)
            ]);
            
            console.log('Payment order created:', orderData.order_id);
            return result.insertId;
        } catch (error) {
            console.error('createPaymentOrder error:', error.message);
            throw error;
        }
    }


    static async updatePaymentOrder(orderId, cfOrderId, sessionId) {
        try {
            const sql = `
                UPDATE payment_orders 
                SET cf_order_id = ?, 
                    payment_session_id = ?,
                    updated_at = NOW()
                WHERE order_id = ?
            `;
            
            await pool.execute(sql, [cfOrderId, sessionId, orderId]);
            console.log('Payment order updated:', orderId);
            return true;
        } catch (error) {
            console.error('updatePaymentOrder error:', error.message);
            throw error;
        }
    }   



    static async getPaymentOrder(orderId) {
        try {
            const sql = 'SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1';
            const [rows] = await pool.execute(sql, [orderId]);
            return rows[0] || null;
        } catch (error) {
            console.error('getPaymentOrder error:', error.message);
            throw error;
        }
    }


    static async updatePaymentStatus(orderId, status, paymentData = {}) {
        try {
            const sql = `
                UPDATE payment_orders 
                SET status = ?, 
                    payment_method = ?,
                    updated_at = NOW()
                WHERE order_id = ?
            `;
            
            await pool.execute(sql, [
                status,
                paymentData.payment_method || null,
                orderId
            ]);
            
            console.log('Payment status updated:', orderId, '->', status);
            return true;
        } catch (error) {
            console.error('updatePaymentStatus error:', error.message);
            throw error;
        }
    }


    static async createPaymentTransaction(transactionData) {
        try {
             const sql = `
                INSERT INTO payment_transactions (
                    cf_payment_id, order_id, amount, status,
                    payment_method, bank_reference, payment_time, webhook_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            await pool.execute(sql, [
                transactionData.cf_payment_id,
                transactionData.order_id,
                transactionData.amount,
                transactionData.status,
                transactionData.payment_method || null,
                transactionData.bank_reference || null,
                transactionData.payment_time || null,
                JSON.stringify(transactionData.webhook_data || {})
            ]);
            
            console.log('Payment transaction recorded:', transactionData.cf_payment_id);
            return true;
        } catch (error) {
            console.error('createPaymentTransaction error:', error.message);
            throw error;
        }
    }


    static async completeMembershipPayment(orderId, paymentAmount) {
        try {
            const orderQuery = 'SELECT membership_data FROM payment_orders WHERE order_id = ?';
            const [orderRows] = await pool.execute(orderQuery, [orderId]);
            
            if (orderRows.length === 0) {
                console.error('Order not found:', orderId);
                return null;
            }
            
                        const raw = orderRows[0].membership_data;
            const membershipData = typeof raw === 'string' ? JSON.parse(raw) : raw;

            if (!membershipData || typeof membershipData !== 'object' || !membershipData.email) {
                console.error('completeMembershipPayment: invalid or missing membership_data for order', orderId);
                return null;
            }
            
            const updateQuery = `
                UPDATE membership_applications 
                SET payment_status = 'paid',
                    order_id = ?,
                    paid_amount = ?,
                    payment_date = NOW(),
                    status = 'approved'
                WHERE email = ?
            `;
            
            await pool.execute(updateQuery, [
                orderId,
                paymentAmount,
                membershipData.email
            ]);
            
            console.log('Membership payment completed for:', membershipData.email);
            return membershipData;
        } catch (error) {
            console.error('completeMembershipPayment error:', error.message);
            throw error;
        }
    }

    static async setMembershipPaymentFailed(orderId) {
        try {
            const [rows] = await pool.execute(
                'SELECT membership_data FROM payment_orders WHERE order_id = ? LIMIT 1',
                [orderId]
            );
            if (rows.length === 0) return;
            const data = rows[0].membership_data;
            if (!data) return;
            const membershipData = typeof data === 'string' ? JSON.parse(data) : data;
            const email = membershipData.email;
            if (!email) return;
            await pool.execute(
                `UPDATE membership_applications
                 SET payment_status = 'failed', updated_at = NOW()
                 WHERE email = ? AND payment_status = 'pending'`,
                [email]
            );
            console.log('Membership payment marked failed for order:', orderId);
        } catch (error) {
            console.error('setMembershipPaymentFailed error:', error.message);
            throw error;
        }
    }

    // Get all payment orders (for admin dashboard)
    static async getAllPaymentOrders() {
        try {
            const sql = 'SELECT * FROM payment_orders ORDER BY created_at DESC';
            return await this.query(sql);
        } catch (error) {
            console.error('getAllPaymentOrders error:', error.message);
            return [];
        }
    }

    // Get payment transactions by order
    static async getPaymentTransactions(orderId) {
        try {
            const sql = 'SELECT * FROM payment_transactions WHERE order_id = ? ORDER BY created_at DESC';
            return await this.query(sql, [orderId]);
        } catch (error) {
            console.error('getPaymentTransactions error:', error.message);
            return [];
        }
    }

    // COMMITTEES
    static slugify(text) {
        return String(text || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'committee';
    }

    static async getAllCommittees(activeOnly = false) {
        const sql = activeOnly
            ? 'SELECT * FROM committees WHERE is_active = true ORDER BY order_index ASC, id ASC'
            : 'SELECT * FROM committees ORDER BY order_index ASC, id ASC';
        return await this.query(sql);
    }

    static async getCommitteeById(id) {
        return await this.getById('committees', id);
    }

    static async getCommitteeBySlug(slug) {
        const sql = 'SELECT * FROM committees WHERE slug = ? AND is_active = true LIMIT 1';
        const rows = await this.query(sql, [slug]);
        return rows[0] || null;
    }

    static async createCommittee(data) {
        const slug = data.slug || this.slugify(data.name);
        const existing = await this.query('SELECT id FROM committees WHERE slug = ?', [slug]);
        let finalSlug = slug;
        if (existing.length > 0) {
            finalSlug = slug + '-' + Date.now();
        }
        const id = await this.create('committees', {
            name: data.name,
            slug: finalSlug,
            photo_url: data.photo_url || '',
            overview: data.overview || '',
            apply_link: data.apply_link || '/membership',
            order_index: parseInt(data.order_index) || 0,
            is_active: data.is_active !== false
        });
        if (slug !== finalSlug) {
            await this.query('UPDATE committees SET slug = ? WHERE id = ?', [finalSlug, id]);
        }
        return id;
    }

    static async updateCommittee(id, data) {
        const allowed = ['name', 'slug', 'photo_url', 'overview', 'apply_link', 'order_index', 'is_active'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else if (k === 'is_active') update[k] = Boolean(data[k]);
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('committees', id, update);
    }

    static async deleteCommittee(id) {
        return await this.delete('committees', id);
    }

    static async getCommitteeLeaders(committeeId) {
        const sql = 'SELECT * FROM committee_leaders WHERE committee_id = ? ORDER BY order_index ASC, id ASC';
        return await this.query(sql, [committeeId]);
    }

    static async getCommitteeSubleaders(committeeId) {
        const sql = 'SELECT * FROM committee_subleaders WHERE committee_id = ? ORDER BY order_index ASC, id ASC';
        return await this.query(sql, [committeeId]);
    }

    static async createCommitteeLeader(data) {
        return await this.create('committee_leaders', {
            committee_id: data.committee_id,
            name: data.name,
            position: data.position || '',
            photo_url: data.photo_url || '',
            order_index: parseInt(data.order_index) || 0
        });
    }

    static async createCommitteeSubleader(data) {
        return await this.create('committee_subleaders', {
            committee_id: data.committee_id,
            name: data.name,
            position: data.position || '',
            photo_url: data.photo_url || '',
            order_index: parseInt(data.order_index) || 0
        });
    }

    static async updateCommitteeLeader(id, data) {
        const allowed = ['name', 'position', 'photo_url', 'order_index'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('committee_leaders', id, update);
    }

    static async updateCommitteeSubleader(id, data) {
        const allowed = ['name', 'position', 'photo_url', 'order_index'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('committee_subleaders', id, update);
    }

    static async deleteCommitteeLeader(id) {
        return await this.delete('committee_leaders', id);
    }

    static async deleteCommitteeSubleader(id) {
        return await this.delete('committee_subleaders', id);
    }

    // CHAPTERS (same as committees)
    static slugifyChapter(text) {
        return String(text || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'chapter';
    }

    static async getAllChapters(activeOnly = false) {
        const sql = activeOnly
            ? 'SELECT * FROM chapters WHERE is_active = true ORDER BY order_index ASC, id ASC'
            : 'SELECT * FROM chapters ORDER BY order_index ASC, id ASC';
        return await this.query(sql);
    }

    static async getChapterById(id) {
        return await this.getById('chapters', id);
    }

    static async getChapterBySlug(slug) {
        const sql = 'SELECT * FROM chapters WHERE slug = ? AND is_active = true LIMIT 1';
        const rows = await this.query(sql, [slug]);
        return rows[0] || null;
    }

    static async createChapter(data) {
        const slug = data.slug || this.slugifyChapter(data.name);
        const existing = await this.query('SELECT id FROM chapters WHERE slug = ?', [slug]);
        let finalSlug = slug;
        if (existing.length > 0) {
            finalSlug = slug + '-' + Date.now();
        }
        const id = await this.create('chapters', {
            name: data.name,
            slug: finalSlug,
            photo_url: data.photo_url || '',
            overview: data.overview || '',
            apply_link: data.apply_link || '/membership',
            order_index: parseInt(data.order_index) || 0,
            is_active: data.is_active !== false
        });
        if (slug !== finalSlug) {
            await this.query('UPDATE chapters SET slug = ? WHERE id = ?', [finalSlug, id]);
        }
        return id;
    }

    static async updateChapter(id, data) {
        const allowed = ['name', 'slug', 'photo_url', 'overview', 'apply_link', 'order_index', 'is_active'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else if (k === 'is_active') update[k] = Boolean(data[k]);
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('chapters', id, update);
    }

    static async deleteChapter(id) {
        return await this.delete('chapters', id);
    }

    static async getChapterLeaders(chapterId) {
        const sql = 'SELECT * FROM chapter_leaders WHERE chapter_id = ? ORDER BY order_index ASC, id ASC';
        return await this.query(sql, [chapterId]);
    }

    static async getChapterSubleaders(chapterId) {
        const sql = 'SELECT * FROM chapter_subleaders WHERE chapter_id = ? ORDER BY order_index ASC, id ASC';
        return await this.query(sql, [chapterId]);
    }

    static async createChapterLeader(data) {
        return await this.create('chapter_leaders', {
            chapter_id: data.chapter_id,
            name: data.name,
            position: data.position || '',
            photo_url: data.photo_url || '',
            order_index: parseInt(data.order_index) || 0
        });
    }

    static async createChapterSubleader(data) {
        return await this.create('chapter_subleaders', {
            chapter_id: data.chapter_id,
            name: data.name,
            position: data.position || '',
            photo_url: data.photo_url || '',
            order_index: parseInt(data.order_index) || 0
        });
    }

    static async updateChapterLeader(id, data) {
        const allowed = ['name', 'position', 'photo_url', 'order_index'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('chapter_leaders', id, update);
    }

    static async updateChapterSubleader(id, data) {
        const allowed = ['name', 'position', 'photo_url', 'order_index'];
        const update = {};
        for (const k of allowed) {
            if (data.hasOwnProperty(k)) {
                if (k === 'order_index') update[k] = parseInt(data[k]) || 0;
                else update[k] = data[k];
            }
        }
        if (Object.keys(update).length === 0) return true;
        return await this.update('chapter_subleaders', id, update);
    }

    static async deleteChapterLeader(id) {
        return await this.delete('chapter_leaders', id);
    }

    static async deleteChapterSubleader(id) {
        return await this.delete('chapter_subleaders', id);
    }

}



module.exports = Database;
