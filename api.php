<?php

declare(strict_types=1);

session_start();

require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
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
            require_staff();
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
            require_staff();
            delete_category_action();
            break;
        case 'create_user':
            ensure_method('POST', $method);
            require_administrator();
            create_user_action();
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

function current_session_payload(): ?array
{
    if (!isset($_SESSION['user'])) {
        return null;
    }

    return [
        'id' => (int) $_SESSION['user']['id'],
        'fullName' => $_SESSION['user']['full_name'],
        'username' => $_SESSION['user']['username'],
        'role' => $_SESSION['user']['role'],
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
            r.original_filename
        FROM resources r
        INNER JOIN categories c ON c.id = r.category_id
    ';

    if (!$includeStaffData) {
        $resourceSql .= " WHERE r.status = 'Active'";
    }

    $resourceSql .= ' ORDER BY r.upload_date DESC, r.id DESC';
    $resources = array_map('normalize_resource_row', $pdo->query($resourceSql)->fetchAll());

    $payload = [
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
        $users = $pdo->query('SELECT id, full_name, username, role, status FROM users ORDER BY full_name')->fetchAll();
        $payload['users'] = array_map(static function (array $user): array {
            return [
                'id' => (int) $user['id'],
                'fullName' => $user['full_name'],
                'username' => $user['username'],
                'role' => $user['role'],
                'status' => $user['status'],
            ];
        }, $users);
    } else {
        $payload['users'] = [];
    }

    return $payload;
}

function normalize_resource_row(array $row): array
{
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
    ];
}

function login_action(): void
{
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = trim((string) ($_POST['password'] ?? ''));

    $stmt = db()->prepare('SELECT id, full_name, username, password_hash, role, status FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || $user['status'] !== 'Active' || !password_verify($password, $user['password_hash'])) {
        error_response('Invalid credentials or inactive account.', 422);
    }

    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'full_name' => $user['full_name'],
        'username' => $user['username'],
        'role' => $user['role'],
    ];

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
    $fileType = trim((string) ($_POST['fileType'] ?? ''));
    $keywords = normalize_keywords((string) ($_POST['keywords'] ?? ''));
    $authorSource = trim((string) ($_POST['authorSource'] ?? ''));
    $uploadDate = trim((string) ($_POST['uploadDate'] ?? ''));
    $status = trim((string) ($_POST['status'] ?? ''));
    $resourceUrl = trim((string) ($_POST['resourceUrl'] ?? ''));
    $dataText = trim((string) ($_POST['dataText'] ?? ''));

    if ($title === '' || $description === '' || $categoryId <= 0 || !in_array($fileType, ['PDF', 'Video', 'Data'], true) || !$keywords || $authorSource === '' || $uploadDate === '') {
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
        $status = $status !== '' ? $status : ($existing['status'] ?? 'Pending Review');
        if (!in_array($status, $allowedStatuses, true)) {
            error_response('Invalid resource status.', 422);
        }
    } else {
        $status = $existing['status'] ?? 'Pending Review';
    }

    $filePayload = handle_uploaded_file($fileType, $existing);
    $sourceMode = $filePayload['source_mode'] ?? ($existing['source_mode'] ?? ($fileType === 'Data' && $dataText !== '' ? 'text' : 'url'));
    $finalResourceUrl = $filePayload['resource_url'] ?? ($resourceUrl !== '' ? $resourceUrl : ($existing['resource_url'] ?? null));
    $finalDataText = $filePayload['data_text'] ?? ($dataText !== '' ? $dataText : ($existing['data_text'] ?? null));
    $storedFilename = $filePayload['stored_filename'] ?? ($existing['stored_filename'] ?? null);
    $originalFilename = $filePayload['original_filename'] ?? ($existing['original_filename'] ?? null);
    $mimeType = $filePayload['mime_type'] ?? ($existing['mime_type'] ?? null);

    if ($fileType === 'Data' && $finalDataText === null && $finalResourceUrl === null) {
        error_response('Provide pasted data or upload a dataset file for data resources.', 422);
    }

    if ($fileType !== 'Data' && $finalResourceUrl === null) {
        error_response('Provide an external file URL or upload a file.', 422);
    }

    if ($resourceId === null) {
        $stmt = $pdo->prepare(
            'INSERT INTO resources (
                title, description, category_id, file_type, keywords_json, author_source, upload_date, status, views,
                source_mode, resource_url, data_text, stored_filename, original_filename, mime_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
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
        ]);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE resources SET
                title = ?, description = ?, category_id = ?, file_type = ?, keywords_json = ?, author_source = ?,
                upload_date = ?, status = ?, source_mode = ?, resource_url = ?, data_text = ?, stored_filename = ?,
                original_filename = ?, mime_type = ?
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
            $resourceId,
        ]);
    }

    respond(['ok' => true, 'db' => database_payload(true)]);
}

function delete_resource_action(): void
{
    $resourceId = (int) ($_POST['id'] ?? 0);
    $lookup = db()->prepare('SELECT stored_filename FROM resources WHERE id = ? LIMIT 1');
    $lookup->execute([$resourceId]);
    $resource = $lookup->fetch();

    $stmt = db()->prepare('DELETE FROM resources WHERE id = ?');
    $stmt->execute([$resourceId]);

    if ($resource && !empty($resource['stored_filename'])) {
      $path = app_config()['upload_dir'] . DIRECTORY_SEPARATOR . $resource['stored_filename'];
      if (is_file($path)) {
          @unlink($path);
      }
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
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function create_user_action(): void
{
    $fullName = trim((string) ($_POST['fullName'] ?? ''));
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = trim((string) ($_POST['password'] ?? ''));
    $role = trim((string) ($_POST['role'] ?? ''));

    if ($fullName === '' || $username === '' || $password === '' || !in_array($role, ['Administrator', 'Encoder'], true)) {
        error_response('Please complete all required user fields.', 422);
    }

    $stmt = db()->prepare('INSERT INTO users (full_name, username, password_hash, role, status) VALUES (?, ?, ?, ?, "Active")');
    $stmt->execute([$fullName, $username, password_hash($password, PASSWORD_DEFAULT), $role]);
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function toggle_user_action(): void
{
    $userId = (int) ($_POST['id'] ?? 0);
    $stmt = db()->prepare('UPDATE users SET status = CASE WHEN status = "Active" THEN "Inactive" ELSE "Active" END WHERE id = ?');
    $stmt->execute([$userId]);
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
    respond(['ok' => true, 'db' => database_payload(true)]);
}

function normalize_keywords(string $keywordsString): array
{
    $keywords = array_values(array_filter(array_map('trim', explode(',', $keywordsString)), static fn (string $keyword): bool => $keyword !== ''));
    return $keywords;
}

function handle_uploaded_file(string $fileType, ?array $existing): array
{
    if (!isset($_FILES['uploadFile']) || ($_FILES['uploadFile']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return [];
    }

    if ($_FILES['uploadFile']['error'] !== UPLOAD_ERR_OK) {
        error_response('File upload failed.', 422);
    }

    $tmpName = $_FILES['uploadFile']['tmp_name'];
    $originalName = basename((string) $_FILES['uploadFile']['name']);
    $mimeType = mime_content_type($tmpName) ?: 'application/octet-stream';
    $extension = pathinfo($originalName, PATHINFO_EXTENSION);
    $storedFilename = uniqid('upload_', true) . ($extension ? '.' . strtolower($extension) : '');
    $uploadDir = app_config()['upload_dir'];
    $target = $uploadDir . DIRECTORY_SEPARATOR . $storedFilename;

    if (!move_uploaded_file($tmpName, $target)) {
        error_response('Unable to store the uploaded file.', 500);
    }

    if ($existing && !empty($existing['stored_filename'])) {
        $oldPath = $uploadDir . DIRECTORY_SEPARATOR . $existing['stored_filename'];
        if (is_file($oldPath)) {
            @unlink($oldPath);
        }
    }

    $relativeUrl = 'uploads/' . rawurlencode($storedFilename);
    if ($fileType === 'Data') {
        return [
            'source_mode' => 'text',
            'resource_url' => null,
            'data_text' => (string) file_get_contents($target),
            'stored_filename' => $storedFilename,
            'original_filename' => $originalName,
            'mime_type' => $mimeType,
        ];
    }

    return [
        'source_mode' => 'upload',
        'resource_url' => $relativeUrl,
        'data_text' => null,
        'stored_filename' => $storedFilename,
        'original_filename' => $originalName,
        'mime_type' => $mimeType,
    ];
}
