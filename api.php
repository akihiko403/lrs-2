<?php

declare(strict_types=1);

session_start();

require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (request_exceeds_post_max_size()) {
        error_response('Uploaded files are too large. Maximum total upload size is ' . readable_bytes(post_max_size_bytes()) . '.', 413);
    }

    $action = $_GET['action'] ?? 'bootstrap';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ($action) {
        case 'bootstrap':
            ensure_method('GET', $method);
            respond([
                'session' => current_session_payload(),
                'db' => database_payload(is_staff()),
            ]);
            break;
        case 'login':
            ensure_method('POST', $method);
            login_action();
            break;
        case 'logout':
            ensure_method('POST', $method);
            if (isset($_SESSION['user'])) {
                log_audit_event('logout', 'account', 'Signed out of the system.');
            }
            session_unset();
            session_destroy();
            respond(['ok' => true]);
            break;
        case 'resource_view':
            ensure_method('POST', $method);
            increment_resource_view();
            break;
        case 'save_resource':
            ensure_method('POST', $method);
            require_staff();
            save_resource_action();
            break;
        case 'delete_resource':
            ensure_method('POST', $method);
            require_administrator();
            delete_resource_action();
            break;
        case 'toggle_resource':
            ensure_method('POST', $method);
            require_staff();
            toggle_resource_action();
            break;
        case 'create_category':
            ensure_method('POST', $method);
            require_staff();
            create_category_action();
            break;
        case 'update_category':
            ensure_method('POST', $method);
            require_staff();
            update_category_action();
            break;
        case 'delete_category':
            ensure_method('POST', $method);
            require_administrator();
            delete_category_action();
            break;
        case 'create_user':
            ensure_method('POST', $method);
            require_administrator();
            create_user_action();
            break;
        case 'update_profile':
            ensure_method('POST', $method);
            update_profile_action();
            break;
        case 'update_settings':
            ensure_method('POST', $method);
            require_administrator();
            update_settings_action();
            break;
        case 'toggle_user':
            ensure_method('POST', $method);
            require_administrator();
            toggle_user_action();
            break;
        case 'delete_user':
            ensure_method('POST', $method);
            require_administrator();
            delete_user_action();
            break;
        default:
            error_response('Unknown action.', 404);
    }
} catch (Throwable $e) {
    error_response($e->getMessage(), 500);
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function error_response(string $message, int $status): void
{
    respond(['error' => $message], $status);
}

function ensure_method(string $expected, string $actual): void
{
    if (strtoupper($expected) !== strtoupper($actual)) {
        error_response('Method not allowed.', 405);
    }
}

function post_max_size_bytes(): int
{
    $value = trim((string) ini_get('post_max_size'));
    if ($value === '') {
        return 0;
    }

    $unit = strtolower(substr($value, -1));
    $number = (float) $value;

    return match ($unit) {
        'g' => (int) ($number * 1024 * 1024 * 1024),
        'm' => (int) ($number * 1024 * 1024),
        'k' => (int) ($number * 1024),
        default => (int) $number,
    };
}

function request_exceeds_post_max_size(): bool
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    $maxBytes = post_max_size_bytes();
    return $contentLength > 0 && $maxBytes > 0 && $contentLength > $maxBytes && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function readable_bytes(int $bytes): string
{
    if ($bytes <= 0) {
        return '0 B';
    }

    $units = ['B', 'KB', 'MB', 'GB'];
    $exponent = min((int) floor(log($bytes, 1024)), count($units) - 1);
    $value = $bytes / (1024 ** $exponent);
    $formatted = $value >= 10 || $exponent === 0 ? number_format($value, 0) : number_format($value, 1);

    return $formatted . ' ' . $units[$exponent];
}

function current_session_payload(): ?array
{
    if (!isset($_SESSION['user'])) {
        return null;
    }

    return [
        'id' => (int) $_SESSION['user']['id'],
        'fullName' => $_SESSION['user']['full_name'],
        'email' => $_SESSION['user']['email'] ?? null,
        'profileImage' => $_SESSION['user']['profile_image'] ?? null,
        'username' => $_SESSION['user']['username'] ?? '',
        'role' => $_SESSION['user']['role'] ?? '',
        'status' => $_SESSION['user']['status'] ?? 'Active',
    ];
}

function is_staff(): bool
{
    return isset($_SESSION['user']['role']) && in_array($_SESSION['user']['role'], ['Administrator', 'Encoder'], true);
}

function require_staff(): void
{
    if (!is_staff()) {
        error_response('Unauthorized.', 401);
    }
}

function require_administrator(): void
{
    if (!isset($_SESSION['user']['role']) || $_SESSION['user']['role'] !== 'Administrator') {
        error_response('Administrator access required.', 403);
    }
}

function database_payload(bool $includeStaffData): array
{
    $pdo = db();
    $categories = $pdo->query('SELECT id, slug, name, description FROM categories ORDER BY name')->fetchAll();

    $resourceSql = '
        SELECT
            r.id,
            r.title,
            r.description,
            r.category_id,
            c.name AS category_name,
            r.file_type,
            r.keywords_json,
            r.author_source,
            r.upload_date,
            r.status,
            r.views,
            r.source_mode,
            r.resource_url,
            r.data_text,
            r.original_filename,
            r.attachments_json
        FROM resources r
        INNER JOIN categories c ON c.id = r.category_id
    ';

    if (!$includeStaffData) {
        $resourceSql .= " WHERE r.status = 'Active'";
    }

    $resourceSql .= ' ORDER BY r.upload_date DESC, r.id DESC';
    $resources = array_map('normalize_resource_row', $pdo->query($resourceSql)->fetchAll());

    $payload = [
        'settings' => settings_payload($pdo),
        'categories' => array_map(static function (array $category): array {
            return [
                'id' => (int) $category['id'],
                'slug' => $category['slug'],
                'name' => $category['name'],
                'description' => $category['description'],
            ];
        }, $categories),
        'resources' => $resources,
    ];

    if ($includeStaffData) {
        $users = $pdo->query('SELECT id, full_name, email, profile_image, username, role, status FROM users ORDER BY full_name')->fetchAll();
        $payload['users'] = array_map(static function (array $user): array {
            return [
                'id' => (int) $user['id'],
                'fullName' => $user['full_name'],
                'email' => $user['email'],
                'profileImage' => $user['profile_image'],
                'username' => $user['username'],
                'role' => $user['role'],
                'status' => $user['status'],
            ];
        }, $users);

        if (($_SESSION['user']['role'] ?? '') === 'Administrator') {
            $auditLogs = $pdo->query('
                SELECT id, user_id, actor_name, actor_username, actor_role, action_type, entity_type, description, target_id, created_at
                FROM audit_logs
                ORDER BY created_at DESC, id DESC
                LIMIT 200
            ')->fetchAll();

            $payload['auditLogs'] = array_map(static function (array $log): array {
                return [
                    'id' => (int) $log['id'],
                    'userId' => $log['user_id'] !== null ? (int) $log['user_id'] : null,
                    'actorName' => $log['actor_name'],
                    'actorUsername' => $log['actor_username'],
                    'actorRole' => $log['actor_role'],
                    'actionType' => $log['action_type'],
                    'entityType' => $log['entity_type'],
                    'description' => $log['description'],
                    'targetId' => $log['target_id'] !== null ? (int) $log['target_id'] : null,
                    'createdAt' => $log['created_at'],
                ];
            }, $auditLogs);
        } else {
            $payload['auditLogs'] = [];
        }
    } else {
        $payload['users'] = [];
        $payload['auditLogs'] = [];
    }

    return $payload;
}

function settings_payload(PDO $pdo): array
{
    $rows = $pdo->query('SELECT setting_key, setting_value FROM app_settings')->fetchAll();
    $settings = [];
    foreach ($rows as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    return [
        'siteTitle' => $settings['site_title'] ?? 'Learning Resource System',
        'siteDescription' => $settings['site_description'] ?? 'School of Fisheries',
        'logoUrl' => $settings['site_logo_url'] ?? '',
    ];
}

function log_audit_event(string $actionType, string $entityType, string $description, ?int $targetId = null, ?array $actor = null): void
{
    $actorData = $actor ?? ($_SESSION['user'] ?? null);
    if (!$actorData) {
        return;
    }

    db()->prepare(
        'INSERT INTO audit_logs (user_id, actor_name, actor_username, actor_role, action_type, entity_type, description, target_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        isset($actorData['id']) ? (int) $actorData['id'] : null,
        (string) ($actorData['full_name'] ?? $actorData['actor_name'] ?? 'Unknown User'),
        (string) ($actorData['username'] ?? $actorData['actor_username'] ?? ''),
        (string) ($actorData['role'] ?? $actorData['actor_role'] ?? ''),
        $actionType,
        $entityType,
        $description,
        $targetId,
    ]);
}

function normalize_resource_row(array $row): array
{
    $files = normalize_resource_files_from_row($row);
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'categoryId' => (int) $row['category_id'],
        'categoryName' => $row['category_name'],
        'fileType' => $row['file_type'],
        'keywords' => json_decode($row['keywords_json'], true) ?: [],
        'authorSource' => $row['author_source'],
        'uploadDate' => $row['upload_date'],
        'status' => $row['status'],
        'views' => (int) $row['views'],
        'sourceMode' => $row['source_mode'],
        'resourceUrl' => $row['resource_url'],
        'dataText' => $row['data_text'],
        'originalFilename' => $row['original_filename'],
        'files' => $files,
    ];
}

function login_action(): void
{
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = trim((string) ($_POST['password'] ?? ''));

    $stmt = db()->prepare('SELECT id, full_name, email, profile_image, username, password_hash, role, status FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || $user['status'] !== 'Active' || !password_verify($password, $user['password_hash'])) {
        error_response('Invalid credentials or inactive account.', 422);
    }

    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'],
        'profile_image' => $user['profile_image'],
        'username' => $user['username'],
        'role' => $user['role'],
        'status' => $user['status'],
    ];

    log_audit_event('login', 'account', 'Signed in to the system.');

    respond([
        'ok' => true,
        'session' => current_session_payload(),
        'db' => database_payload(true),
    ]);
}

function increment_resource_view(): void
{
    $resourceId = (int) ($_POST['id'] ?? 0);
    $stmt = db()->prepare('UPDATE resources SET views = views + 1 WHERE id = ? AND status = "Active"');
    $stmt->execute([$resourceId]);
    respond([
        'ok' => true,
        'db' => database_payload(is_staff()),
    ]);
}

function save_resource_action(): void
{
    $pdo = db();
    $resourceId = isset($_POST['id']) && $_POST['id'] !== '' ? (int) $_POST['id'] : null;
    $title = trim((string) ($_POST['title'] ?? ''));
    $description = trim((string) ($_POST['description'] ?? ''));
    $categoryId = (int) ($_POST['categoryId'] ?? 0);
    $keywords = normalize_keywords((string) ($_POST['keywords'] ?? ''));
    $authorSource = trim((string) ($_POST['authorSource'] ?? ''));
    $uploadDate = trim((string) ($_POST['uploadDate'] ?? ''));
    $status = trim((string) ($_POST['status'] ?? ''));
    $resourceUrl = trim((string) ($_POST['resourceUrl'] ?? ''));
    $dataText = trim((string) ($_POST['dataText'] ?? ''));

    if ($title === '' || $description === '' || $categoryId <= 0 || $authorSource === '' || $uploadDate === '') {
        error_response('Please complete all required resource fields.', 422);
    }

    $existing = null;
    if ($resourceId !== null) {
        $stmt = $pdo->prepare('SELECT * FROM resources WHERE id = ? LIMIT 1');
        $stmt->execute([$resourceId]);
        $existing = $stmt->fetch();
        if (!$existing) {
            error_response('Resource not found.', 404);
        }
    }

    $allowedStatuses = ['Pending Review', 'Active', 'Inactive'];
    $isAdministrator = ($_SESSION['user']['role'] ?? '') === 'Administrator';

    if ($isAdministrator) {
        $status = $status !== '' ? $status : ($existing['status'] ?? 'Active');
        if (!in_array($status, $allowedStatuses, true)) {
            error_response('Invalid resource status.', 422);
        }
    } else {
        $status = $existing['status'] ?? 'Active';
    }

    $existingFiles = $existing ? normalize_resource_files_from_row($existing) : [];
    $fileBuild = build_resource_files($title, $resourceUrl, $dataText, $_FILES['uploadFile'] ?? null, $existingFiles);
    $resourceFiles = $fileBuild['files'];
    $fileType = $fileBuild['fileType'];

    if (!$resourceFiles || !in_array($fileType, ['PDF', 'Video', 'Data'], true)) {
        error_response('Provide at least one valid file, URL, or data source for this resource.', 422);
    }

    $primaryFile = $resourceFiles[0];
    $sourceMode = $primaryFile['sourceMode'] ?? 'upload';
    $finalResourceUrl = $primaryFile['resourceUrl'] ?? null;
    $finalDataText = $primaryFile['dataText'] ?? null;
    $storedFilename = $primaryFile['storedFilename'] ?? null;
    $originalFilename = $primaryFile['originalFilename'] ?? null;
    $mimeType = $primaryFile['mimeType'] ?? null;
    $attachmentsJson = json_encode($resourceFiles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($resourceId === null) {
        $stmt = $pdo->prepare(
            'INSERT INTO resources (
                title, description, category_id, file_type, keywords_json, author_source, upload_date, status, views,
                source_mode, resource_url, data_text, stored_filename, original_filename, mime_type, attachments_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $title,
            $description,
            $categoryId,
            $fileType,
            json_encode($keywords, JSON_UNESCAPED_UNICODE),
            $authorSource,
            $uploadDate,
            $status,
            $sourceMode,
            $finalResourceUrl,
            $finalDataText,
            $storedFilename,
            $originalFilename,
            $mimeType,
            $attachmentsJson,
        ]);
        $resourceId = (int) $pdo->lastInsertId();
        log_audit_event('upload', 'resource', sprintf('Uploaded resource "%s".', $title), $resourceId);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE resources SET
                title = ?, description = ?, category_id = ?, file_type = ?, keywords_json = ?, author_source = ?,
                upload_date = ?, status = ?, source_mode = ?, resource_url = ?, data_text = ?, stored_filename = ?,
                original_filename = ?, mime_type = ?, attachments_json = ?
             WHERE id = ?'
        );
        $stmt->execute([
            $title,
            $description,
            $categoryId,
            $fileType,
            json_encode($keywords, JSON_UNESCAPED_UNICODE),
            $authorSource,
            $uploadDate,
            $status,
            $sourceMode,
            $finalResourceUrl,
            $finalDataText,
            $storedFilename,
            $originalFilename,
            $mimeType,
            $attachmentsJson,
            $resourceId,
        ]);
        log_audit_event('edit', 'resource', sprintf('Edited resource "%s".', $title), $resourceId);
    }

    if ($existing && $fileBuild['replacedExisting']) {
        cleanup_removed_uploads($existingFiles, $resourceFiles);
    }

    respond(['ok' => true, 'db' => database_payload(true)]);
}

function delete_resource_action(): void
{
    $resourceId = (int) ($_POST['id'] ?? 0);
    $lookup = db()->prepare('SELECT title, stored_filename, resource_url, data_text, original_filename, mime_type, source_mode, file_type, attachments_json FROM resources WHERE id = ? LIMIT 1');
    $lookup->execute([$resourceId]);
    $resource = $lookup->fetch();

    $stmt = db()->prepare('DELETE FROM resources WHERE id = ?');
    $stmt->execute([$resourceId]);

    if ($resource) {
        log_audit_event('delete', 'resource', sprintf('Deleted resource "%s".', $resource['title'] ?: 'Resource'), $resourceId);
    }

    if ($resource) {
        cleanup_removed_uploads(normalize_resource_files_from_row($resource), []);
    }

    respond(['ok' => true, 'db' => database_payload(true)]);
}

function toggle_resource_action(): void
{
    require_administrator();
    $resourceId = (int) ($_POST['id'] ?? 0);
    $stmt = db()->prepare(
        'UPDATE resources
         SET status = CASE
             WHEN status = "Pending Review" THEN "Active"
             WHEN status = "Active" THEN "Inactive"
             ELSE "Active"
         END
         WHERE id = ?'
    );
    $stmt->execute([$resourceId]);
    log_audit_event('edit', 'resource', 'Changed a resource review status.', $resourceId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function create_category_action(): void
{
    $name = trim((string) ($_POST['name'] ?? ''));
    $description = trim((string) ($_POST['description'] ?? ''));
    if ($name === '' || $description === '') {
        error_response('Category name and description are required.', 422);
    }

    $slug = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $name), '-'));
    $stmt = db()->prepare('INSERT INTO categories (slug, name, description) VALUES (?, ?, ?)');
    $stmt->execute([$slug, $name, $description]);
    $categoryId = (int) db()->lastInsertId();
    log_audit_event('add', 'category', sprintf('Added category "%s".', $name), $categoryId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function update_category_action(): void
{
    $categoryId = (int) ($_POST['id'] ?? 0);
    $name = trim((string) ($_POST['name'] ?? ''));
    $description = trim((string) ($_POST['description'] ?? ''));

    if ($categoryId <= 0 || $name === '' || $description === '') {
        error_response('Category name and description are required.', 422);
    }

    $slug = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $name), '-'));
    $stmt = db()->prepare('UPDATE categories SET slug = ?, name = ?, description = ? WHERE id = ?');
    $stmt->execute([$slug, $name, $description, $categoryId]);
    log_audit_event('edit', 'category', sprintf('Edited category "%s".', $name), $categoryId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function delete_category_action(): void
{
    $categoryId = (int) ($_POST['id'] ?? 0);
    $check = db()->prepare('SELECT COUNT(*) FROM resources WHERE category_id = ?');
    $check->execute([$categoryId]);
    if ((int) $check->fetchColumn() > 0) {
        error_response('This category is in use by existing resources.', 422);
    }

    $stmt = db()->prepare('DELETE FROM categories WHERE id = ?');
    $stmt->execute([$categoryId]);
    log_audit_event('delete', 'category', 'Deleted a category.', $categoryId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function create_user_action(): void
{
    $fullName = trim((string) ($_POST['fullName'] ?? ''));
    $email = trim((string) ($_POST['email'] ?? ''));
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = trim((string) ($_POST['password'] ?? ''));
    $role = trim((string) ($_POST['role'] ?? ''));

    if ($fullName === '' || $email === '' || $username === '' || $password === '' || !in_array($role, ['Administrator', 'Encoder'], true)) {
        error_response('Please complete all required user fields.', 422);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_response('Please enter a valid email address.', 422);
    }

    $stmt = db()->prepare('INSERT INTO users (full_name, email, profile_image, username, password_hash, role, status) VALUES (?, ?, NULL, ?, ?, ?, "Active")');
    $stmt->execute([$fullName, $email, $username, password_hash($password, PASSWORD_DEFAULT), $role]);
    $createdUserId = (int) db()->lastInsertId();
    log_audit_event('add', 'user', sprintf('Added user account "%s".', $fullName), $createdUserId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function update_profile_action(): void
{
    $userId = (int) ($_SESSION['user']['id'] ?? 0);
    if ($userId <= 0) {
        error_response('Unauthorized.', 401);
    }

    $fullName = trim((string) ($_POST['fullName'] ?? ''));
    $email = trim((string) ($_POST['email'] ?? ''));

    if ($fullName === '' || $email === '') {
        error_response('Name and email are required.', 422);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_response('Please enter a valid email address.', 422);
    }

    $pdo = db();
    $lookup = $pdo->prepare('SELECT profile_image, username, role, status FROM users WHERE id = ? LIMIT 1');
    $lookup->execute([$userId]);
    $existing = $lookup->fetch();
    if (!$existing) {
        error_response('User account not found.', 404);
    }

    $profileImage = $existing['profile_image'] ?? null;
    if (isset($_FILES['profileImage']) && ($_FILES['profileImage']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $profileImage = store_profile_image($_FILES['profileImage'], $profileImage);
    }

    $stmt = $pdo->prepare('UPDATE users SET full_name = ?, email = ?, profile_image = ? WHERE id = ?');
    $stmt->execute([$fullName, $email, $profileImage, $userId]);

    $_SESSION['user']['full_name'] = $fullName;
    $_SESSION['user']['email'] = $email;
    $_SESSION['user']['profile_image'] = $profileImage;
    $_SESSION['user']['username'] = $_SESSION['user']['username'] ?? $existing['username'];
    $_SESSION['user']['role'] = $_SESSION['user']['role'] ?? $existing['role'];
    $_SESSION['user']['status'] = $_SESSION['user']['status'] ?? $existing['status'];

    log_audit_event('edit', 'profile', 'Updated personal profile information.', $userId);

    respond([
        'ok' => true,
        'session' => current_session_payload(),
        'db' => database_payload(true),
    ]);
}

function update_settings_action(): void
{
    $siteTitle = trim((string) ($_POST['siteTitle'] ?? ''));
    $siteDescription = trim((string) ($_POST['siteDescription'] ?? ''));

    if ($siteTitle === '' || $siteDescription === '') {
        error_response('Title and description are required.', 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare('REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)');
    $stmt->execute(['site_title', $siteTitle]);
    $stmt->execute(['site_description', $siteDescription]);
    $currentLogo = settings_payload($pdo)['logoUrl'] ?? '';
    $logoUrl = $currentLogo;

    if (isset($_FILES['siteLogo']) && ($_FILES['siteLogo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $logoUrl = store_site_logo($_FILES['siteLogo'], $currentLogo ?: null);
    }

    $stmt->execute(['site_logo_url', $logoUrl]);

    log_audit_event('edit', 'settings', 'Updated site title and description.');

    respond([
        'ok' => true,
        'db' => database_payload(true),
        'session' => current_session_payload(),
    ]);
}

function store_site_logo(array $uploadFile, ?string $existingLogo = null): string
{
    if (($uploadFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_response('Logo upload failed.', 422);
    }

    $tmpName = $uploadFile['tmp_name'] ?? '';
    $originalName = basename((string) ($uploadFile['name'] ?? ''));
    $extension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

    if (!in_array($extension, $allowedExtensions, true)) {
        error_response('Logo must be JPG, PNG, WEBP, or SVG.', 422);
    }

    $uploadDir = app_config()['upload_dir'];
    $storedFilename = uniqid('logo_', true) . '.' . $extension;
    $target = $uploadDir . DIRECTORY_SEPARATOR . $storedFilename;

    if (!move_uploaded_file($tmpName, $target)) {
        error_response('Unable to store the logo image.', 500);
    }

    if ($existingLogo) {
        $existingFilename = basename((string) $existingLogo);
        $existingPath = $uploadDir . DIRECTORY_SEPARATOR . $existingFilename;
        if (is_file($existingPath)) {
            @unlink($existingPath);
        }
    }

    return 'uploads/' . rawurlencode($storedFilename);
}

function toggle_user_action(): void
{
    $userId = (int) ($_POST['id'] ?? 0);
    $stmt = db()->prepare('UPDATE users SET status = CASE WHEN status = "Active" THEN "Inactive" ELSE "Active" END WHERE id = ?');
    $stmt->execute([$userId]);
    log_audit_event('edit', 'user', 'Changed a user account status.', $userId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function delete_user_action(): void
{
    $userId = (int) ($_POST['id'] ?? 0);
    if ((int) ($_SESSION['user']['id'] ?? 0) === $userId) {
        error_response('You cannot delete the account you are currently using.', 422);
    }

    $stmt = db()->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    log_audit_event('delete', 'user', 'Deleted a user account.', $userId);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function normalize_keywords(string $keywordsString): array
{
    $keywords = array_values(array_filter(array_map('trim', explode(',', $keywordsString)), static fn (string $keyword): bool => $keyword !== ''));
    return $keywords;
}

function normalize_resource_files_from_row(array $row): array
{
    $decoded = json_decode((string) ($row['attachments_json'] ?? ''), true);
    if (is_array($decoded) && $decoded) {
        return array_values(array_filter(array_map(static function ($file): ?array {
            if (!is_array($file)) {
                return null;
            }

            return [
                'fileType' => $file['fileType'] ?? '',
                'sourceMode' => $file['sourceMode'] ?? 'upload',
                'resourceUrl' => $file['resourceUrl'] ?? null,
                'dataText' => $file['dataText'] ?? null,
                'storedFilename' => $file['storedFilename'] ?? null,
                'originalFilename' => $file['originalFilename'] ?? null,
                'mimeType' => $file['mimeType'] ?? null,
            ];
        }, $decoded)));
    }

    if (!empty($row['stored_filename']) || !empty($row['resource_url']) || !empty($row['data_text'])) {
        return [[
            'fileType' => $row['file_type'] ?? '',
            'sourceMode' => $row['source_mode'] ?? 'upload',
            'resourceUrl' => $row['resource_url'] ?? null,
            'dataText' => $row['data_text'] ?? null,
            'storedFilename' => $row['stored_filename'] ?? null,
            'originalFilename' => $row['original_filename'] ?? null,
            'mimeType' => $row['mime_type'] ?? null,
        ]];
    }

    return [];
}

function detect_file_type_from_name(string $filename): string
{
    $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
    return match ($extension) {
        'pdf' => 'PDF',
        'mp4', 'mov', 'avi', 'webm', 'mkv' => 'Video',
        'csv', 'json', 'txt' => 'Data',
        default => '',
    };
}

function normalize_uploaded_files(?array $uploadFile): array
{
    if (!$uploadFile || !isset($uploadFile['error'])) {
        return [];
    }

    if (!is_array($uploadFile['error'])) {
        if (($uploadFile['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return [];
        }

        return [$uploadFile];
    }

    $files = [];
    foreach ($uploadFile['error'] as $index => $error) {
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        $files[] = [
            'name' => $uploadFile['name'][$index] ?? '',
            'type' => $uploadFile['type'][$index] ?? '',
            'tmp_name' => $uploadFile['tmp_name'][$index] ?? '',
            'error' => $error,
            'size' => $uploadFile['size'][$index] ?? 0,
        ];
    }

    return $files;
}

function store_profile_image(array $uploadFile, ?string $existingImage = null): string
{
    if (($uploadFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_response('Profile image upload failed.', 422);
    }

    $tmpName = $uploadFile['tmp_name'] ?? '';
    $originalName = basename((string) ($uploadFile['name'] ?? ''));
    $extension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];

    if (!in_array($extension, $allowedExtensions, true)) {
        error_response('Profile image must be JPG, PNG, or WEBP.', 422);
    }

    $uploadDir = app_config()['upload_dir'];
    $storedFilename = uniqid('profile_', true) . '.' . $extension;
    $target = $uploadDir . DIRECTORY_SEPARATOR . $storedFilename;

    if (!move_uploaded_file($tmpName, $target)) {
        error_response('Unable to store the profile image.', 500);
    }

    if ($existingImage) {
        $existingFilename = basename((string) $existingImage);
        $existingPath = $uploadDir . DIRECTORY_SEPARATOR . $existingFilename;
        if (is_file($existingPath)) {
            @unlink($existingPath);
        }
    }

    return 'uploads/' . rawurlencode($storedFilename);
}

function build_resource_files(string $title, string $resourceUrl, string $dataText, ?array $uploadFile, array $existingFiles): array
{
    $uploadedFiles = normalize_uploaded_files($uploadFile);
    if (count($uploadedFiles) > 20) {
        error_response('You can upload up to 20 files at a time.', 422);
    }

    if ($uploadedFiles) {
        $storedFiles = store_uploaded_files($uploadedFiles);
        return [
            'files' => $storedFiles,
            'fileType' => $storedFiles[0]['fileType'] ?? '',
            'replacedExisting' => true,
        ];
    }

    if ($dataText !== '') {
        return [
            'files' => [[
                'fileType' => 'Data',
                'sourceMode' => 'text',
                'resourceUrl' => null,
                'dataText' => $dataText,
                'storedFilename' => null,
                'originalFilename' => slugify_filename($title) . '.txt',
                'mimeType' => 'text/plain',
            ]],
            'fileType' => 'Data',
            'replacedExisting' => true,
        ];
    }

    if ($resourceUrl !== '') {
        $detectedType = detect_file_type_from_name((string) parse_url($resourceUrl, PHP_URL_PATH));
        return [
            'files' => [[
                'fileType' => $detectedType,
                'sourceMode' => 'url',
                'resourceUrl' => $resourceUrl,
                'dataText' => null,
                'storedFilename' => null,
                'originalFilename' => basename((string) parse_url($resourceUrl, PHP_URL_PATH)) ?: slugify_filename($title),
                'mimeType' => null,
            ]],
            'fileType' => $detectedType,
            'replacedExisting' => true,
        ];
    }

    return [
        'files' => $existingFiles,
        'fileType' => $existingFiles[0]['fileType'] ?? '',
        'replacedExisting' => false,
    ];
}

function slugify_filename(string $value): string
{
    $slug = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $value), '-'));
    return $slug !== '' ? $slug : 'resource';
}

function store_uploaded_files(array $uploadedFiles): array
{
    $uploadDir = app_config()['upload_dir'];
    $stored = [];

    foreach ($uploadedFiles as $uploadFile) {
        if (($uploadFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            error_response('File upload failed.', 422);
        }

        $tmpName = $uploadFile['tmp_name'];
        $originalName = basename((string) $uploadFile['name']);
        $mimeType = mime_content_type($tmpName) ?: 'application/octet-stream';
        $fileType = detect_file_type_from_name($originalName);
        if (!in_array($fileType, ['PDF', 'Video', 'Data'], true)) {
            error_response('One of the uploaded files has an unsupported type.', 422);
        }

        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $storedFilename = uniqid('upload_', true) . ($extension ? '.' . strtolower($extension) : '');
        $target = $uploadDir . DIRECTORY_SEPARATOR . $storedFilename;

        if (!move_uploaded_file($tmpName, $target)) {
            error_response('Unable to store the uploaded file.', 500);
        }

        $relativeUrl = 'uploads/' . rawurlencode($storedFilename);
        $stored[] = [
            'fileType' => $fileType,
            'sourceMode' => $fileType === 'Data' ? 'text' : 'upload',
            'resourceUrl' => $fileType === 'Data' ? null : $relativeUrl,
            'dataText' => $fileType === 'Data' ? (string) file_get_contents($target) : null,
            'storedFilename' => $storedFilename,
            'originalFilename' => $originalName,
            'mimeType' => $mimeType,
        ];
    }

    return $stored;
}

function cleanup_removed_uploads(array $previousFiles, array $currentFiles): void
{
    $currentStored = array_filter(array_map(static fn (array $file): ?string => $file['storedFilename'] ?? null, $currentFiles));
    foreach ($previousFiles as $file) {
        $storedFilename = $file['storedFilename'] ?? null;
        if ($storedFilename && !in_array($storedFilename, $currentStored, true)) {
            $path = app_config()['upload_dir'] . DIRECTORY_SEPARATOR . $storedFilename;
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }
}
