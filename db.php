<?php

declare(strict_types=1);

function app_config(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }

    return $config;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = app_config();
    $baseDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $config['db_host'], $config['db_port']);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $server = new PDO($baseDsn, $config['db_user'], $config['db_pass'], $options);
    $server->exec(sprintf(
        'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        str_replace('`', '``', $config['db_name'])
    ));

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name']
    );
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);

    initialize_schema($pdo);
    ensure_upload_directory($config['upload_dir']);
    seed_defaults($pdo);

    return $pdo;
}

function initialize_schema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS categories (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            slug VARCHAR(120) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL UNIQUE,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(140) NOT NULL,
            username VARCHAR(60) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM("Administrator", "Encoder") NOT NULL,
            status ENUM("Active", "Inactive") NOT NULL DEFAULT "Active",
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS resources (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            category_id INT UNSIGNED NOT NULL,
            file_type ENUM("PDF", "Video", "Data") NOT NULL,
            keywords_json LONGTEXT NOT NULL,
            author_source VARCHAR(255) NOT NULL,
            upload_date DATE NOT NULL,
            status ENUM("Pending Review", "Active", "Inactive") NOT NULL DEFAULT "Active",
            views INT UNSIGNED NOT NULL DEFAULT 0,
            source_mode ENUM("url", "upload", "text") NOT NULL DEFAULT "url",
            resource_url TEXT NULL,
            data_text LONGTEXT NULL,
            stored_filename VARCHAR(255) NULL,
            original_filename VARCHAR(255) NULL,
            mime_type VARCHAR(120) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_resources_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'ALTER TABLE resources
         MODIFY COLUMN status ENUM("Pending Review", "Active", "Inactive") NOT NULL DEFAULT "Active"'
    );
}

function ensure_upload_directory(string $uploadDir): void
{
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
}

function seed_defaults(PDO $pdo): void
{
    $categoryCount = (int) $pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn();
    if ($categoryCount === 0) {
        $categories = [
            ['aquaculture', 'Aquaculture', 'Culture systems, hatchery methods, and sustainable fish production.'],
            ['marine-ecology', 'Marine Ecology', 'Ecosystems, biodiversity, habitats, and fisheries conservation studies.'],
            ['post-harvest', 'Post-Harvest', 'Handling, storage, processing, safety, and product quality practices.'],
            ['fishing-technology', 'Fishing Technology', 'Gear systems, vessel operations, navigation, and fish finding methods.'],
            ['fisheries-policy', 'Fisheries Policy', 'Regulations, coastal governance, management plans, and community programs.'],
        ];
        $stmt = $pdo->prepare('INSERT INTO categories (slug, name, description) VALUES (?, ?, ?)');
        foreach ($categories as $category) {
            $stmt->execute($category);
        }
    }

    $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $stmt = $pdo->prepare('INSERT INTO users (full_name, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute(['Marina Santos', 'admin', password_hash('admin123', PASSWORD_DEFAULT), 'Administrator', 'Active']);
        $stmt->execute(['Joel Navarro', 'encoder', password_hash('encode123', PASSWORD_DEFAULT), 'Encoder', 'Active']);
    }

    $resourceCount = (int) $pdo->query('SELECT COUNT(*) FROM resources')->fetchColumn();
    if ($resourceCount === 0) {
        $categoryIds = [];
        foreach ($pdo->query('SELECT id, slug FROM categories') as $row) {
            $categoryIds[$row['slug']] = (int) $row['id'];
        }

        $resources = [
            [
                'Milkfish Hatchery Operations Manual',
                'A practical PDF manual covering broodstock management, larval rearing, water quality, and nursery protocols for bangus hatcheries.',
                $categoryIds['aquaculture'],
                'PDF',
                json_encode(['milkfish', 'hatchery', 'broodstock', 'water quality'], JSON_UNESCAPED_UNICODE),
                'School of Fisheries Extension Unit',
                '2026-03-20',
                'Active',
                128,
                'url',
                'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                null,
                null,
                null,
                null,
            ],
            [
                'Coral Reef Fisheries Monitoring Basics',
                'An introductory video lecture on reef fish assessment, transect recording, and community-based monitoring practices.',
                $categoryIds['marine-ecology'],
                'Video',
                json_encode(['reef', 'monitoring', 'transect', 'assessment'], JSON_UNESCAPED_UNICODE),
                'Dean L. Mercado',
                '2026-03-28',
                'Active',
                214,
                'url',
                'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
                null,
                null,
                null,
                null,
            ],
            [
                'Municipal Catch Composition Dataset',
                'CSV-ready fisheries landing data showing species composition, catch volume, and landing site summary for instructional analysis.',
                $categoryIds['fisheries-policy'],
                'Data',
                json_encode(['dataset', 'catch', 'landing', 'species'], JSON_UNESCAPED_UNICODE),
                'Provincial Fisheries Office',
                '2026-04-01',
                'Active',
                87,
                'text',
                null,
                "landing_site,species,volume_kg\nNorth Port,Tuna,420\nNorth Port,Mackerel,180\nEast Bay,Rabbitfish,95\nEast Bay,Squid,130",
                null,
                null,
                'text/plain',
            ],
            [
                'Fish Smoking and Drying Quality Guide',
                'A PDF guide on hygienic handling, drying platforms, salting levels, and safe storage for value-added fish products.',
                $categoryIds['post-harvest'],
                'PDF',
                json_encode(['smoking', 'drying', 'processing', 'food safety'], JSON_UNESCAPED_UNICODE),
                'Food Technology Laboratory',
                '2026-03-17',
                'Active',
                64,
                'url',
                'https://www.orimi.com/pdf-test.pdf',
                null,
                null,
                null,
                null,
            ],
            [
                'Electronic Fish Finder Demonstration',
                'Short instructional video on fish finder setup, transducer placement, and interpreting sonar returns during fieldwork.',
                $categoryIds['fishing-technology'],
                'Video',
                json_encode(['sonar', 'navigation', 'fish finder', 'vessel'], JSON_UNESCAPED_UNICODE),
                'Marine Technology Center',
                '2026-04-03',
                'Inactive',
                31,
                'url',
                'https://samplelib.com/lib/preview/mp4/sample-10s.mp4',
                null,
                null,
                null,
                null,
            ],
        ];

        $stmt = $pdo->prepare(
            'INSERT INTO resources (
                title, description, category_id, file_type, keywords_json, author_source, upload_date, status, views,
                source_mode, resource_url, data_text, stored_filename, original_filename, mime_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($resources as $resource) {
            $stmt->execute($resource);
        }
    }
}
