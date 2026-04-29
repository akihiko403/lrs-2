<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

class LegacyApiService
{
    public function handle(Request $request): JsonResponse
    {
        try {
            if ($this->requestExceedsPostMaxSize($request)) {
                throw new LegacyApiException(
                    'Uploaded files are too large. Maximum total upload size is ' . $this->readableBytes($this->postMaxSizeBytes()) . '.',
                    413
                );
            }

            $action = (string) $request->query('action', 'bootstrap');
            $method = strtoupper($request->method());

            return match ($action) {
                'bootstrap' => $this->bootstrap($method),
                'login' => $this->login($request, $method),
                'logout' => $this->logout($request, $method),
                'resource_view' => $this->resourceView($request, $method),
                'save_resource' => $this->saveResource($request, $method),
                'delete_resource' => $this->deleteResource($request, $method),
                'toggle_resource' => $this->toggleResource($request, $method),
                'create_category' => $this->createCategory($request, $method),
                'update_category' => $this->updateCategory($request, $method),
                'delete_category' => $this->deleteCategory($request, $method),
                'create_user' => $this->createUser($request, $method),
                'update_profile' => $this->updateProfile($request, $method),
                'change_password' => $this->changePassword($request, $method),
                'update_settings' => $this->updateSettings($request, $method),
                'toggle_user' => $this->toggleUser($request, $method),
                'delete_user' => $this->deleteUser($request, $method),
                default => $this->respond(['error' => 'Unknown action.'], 404),
            };
        } catch (LegacyApiException $e) {
            return $this->respond(['error' => $e->getMessage()], $e->status());
        } catch (Throwable $e) {
            return $this->respond(['error' => $e->getMessage()], 500);
        }
    }

    protected function bootstrap(string $method): JsonResponse
    {
        $this->ensureMethod('GET', $method);

        return $this->respond([
            'session' => $this->currentSessionPayload(),
            'db' => $this->databasePayload($this->isStaff()),
        ]);
    }

    protected function login(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);

        $username = trim((string) $request->input('username', ''));
        $password = trim((string) $request->input('password', ''));

        $user = DB::table('users')
            ->select('id', 'full_name', 'email', 'profile_image', 'username', 'password_hash', 'role', 'status')
            ->where('username', $username)
            ->first();

        if (!$user || $user->status !== 'Active' || !password_verify($password, $user->password_hash)) {
            throw new LegacyApiException('Invalid credentials or inactive account.', 422);
        }

        session([
            'user' => [
                'id' => (int) $user->id,
                'full_name' => $user->full_name,
                'email' => $user->email,
                'profile_image' => $user->profile_image,
                'username' => $user->username,
                'role' => $user->role,
                'status' => $user->status,
            ],
        ]);

        $this->logAuditEvent('login', 'account', 'Signed in to the system.');

        return $this->respond([
            'ok' => true,
            'session' => $this->currentSessionPayload(),
            'db' => $this->databasePayload(true),
        ]);
    }

    protected function logout(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);

        if (session()->has('user')) {
            $this->logAuditEvent('logout', 'account', 'Signed out of the system.');
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return $this->respond(['ok' => true]);
    }

    protected function resourceView(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);

        DB::table('resources')
            ->where('id', (int) $request->input('id', 0))
            ->where('status', 'Active')
            ->increment('views');

        return $this->respond([
            'ok' => true,
            'db' => $this->databasePayload($this->isStaff()),
        ]);
    }

    protected function saveResource(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireStaff();

        $resourceId = $request->filled('id') ? (int) $request->input('id') : null;
        $title = trim((string) $request->input('title', ''));
        $description = trim((string) $request->input('description', ''));
        $categoryId = (int) $request->input('categoryId', 0);
        $keywords = $this->normalizeKeywords((string) $request->input('keywords', ''));
        $authorSource = trim((string) $request->input('authorSource', ''));
        $uploadDate = trim((string) $request->input('uploadDate', ''));
        $status = trim((string) $request->input('status', ''));
        $resourceUrl = trim((string) $request->input('resourceUrl', ''));
        $dataText = trim((string) $request->input('dataText', ''));

        if ($title === '' || $description === '' || $categoryId <= 0 || $authorSource === '' || $uploadDate === '') {
            throw new LegacyApiException('Please complete all required resource fields.', 422);
        }

        $existing = null;
        if ($resourceId !== null) {
            $existingRow = DB::table('resources')->where('id', $resourceId)->first();
            if (!$existingRow) {
                throw new LegacyApiException('Resource not found.', 404);
            }

            $existing = (array) $existingRow;
        }

        $allowedStatuses = ['Pending Review', 'Active', 'Inactive'];
        $isAdministrator = (session('user.role') ?? '') === 'Administrator';

        if ($isAdministrator) {
            $status = $status !== '' ? $status : ($existing['status'] ?? 'Active');
            if (!in_array($status, $allowedStatuses, true)) {
                throw new LegacyApiException('Invalid resource status.', 422);
            }
        } else {
            $status = $existing['status'] ?? 'Active';
        }

        $existingFiles = $existing ? $this->normalizeResourceFilesFromRow($existing) : [];
        $existingFiles = $this->filterRetainedExistingFiles($existingFiles, $request->input('retainedExistingFiles'));
        $fileBuild = $this->buildResourceFiles($title, $resourceUrl, $dataText, $request->file('uploadFile'), $existingFiles);
        $resourceFiles = $fileBuild['files'];
        $fileType = $fileBuild['fileType'];

        if (!$resourceFiles || !in_array($fileType, ['PDF', 'Video', 'Data'], true)) {
            throw new LegacyApiException('Provide at least one valid file, URL, or data source for this resource.', 422);
        }

        $primaryFile = $resourceFiles[0];
        $payload = [
            'title' => $title,
            'description' => $description,
            'category_id' => $categoryId,
            'file_type' => $fileType,
            'keywords_json' => json_encode($keywords, JSON_UNESCAPED_UNICODE),
            'author_source' => $authorSource,
            'upload_date' => $uploadDate,
            'status' => $status,
            'source_mode' => $primaryFile['sourceMode'] ?? 'upload',
            'resource_url' => $primaryFile['resourceUrl'] ?? null,
            'data_text' => $primaryFile['dataText'] ?? null,
            'stored_filename' => $primaryFile['storedFilename'] ?? null,
            'original_filename' => $primaryFile['originalFilename'] ?? null,
            'mime_type' => $primaryFile['mimeType'] ?? null,
            'attachments_json' => json_encode($resourceFiles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];

        if ($resourceId === null) {
            $payload['views'] = 0;
            $resourceId = (int) DB::table('resources')->insertGetId($payload);
            $this->logAuditEvent('upload', 'resource', sprintf('Uploaded resource "%s".', $title), $resourceId);
        } else {
            DB::table('resources')->where('id', $resourceId)->update($payload);
            $this->logAuditEvent('edit', 'resource', sprintf('Edited resource "%s".', $title), $resourceId);
        }

        if ($existing && $fileBuild['replacedExisting']) {
            $this->cleanupRemovedUploads($existingFiles, $resourceFiles);
        }

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function deleteResource(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $resourceId = (int) $request->input('id', 0);
        $resourceRow = DB::table('resources')
            ->select('title', 'stored_filename', 'resource_url', 'data_text', 'original_filename', 'mime_type', 'source_mode', 'file_type', 'attachments_json')
            ->where('id', $resourceId)
            ->first();

        DB::table('resources')->where('id', $resourceId)->delete();

        if ($resourceRow) {
            $resource = (array) $resourceRow;
            $this->logAuditEvent('delete', 'resource', sprintf('Deleted resource "%s".', $resource['title'] ?: 'Resource'), $resourceId);
            $this->cleanupRemovedUploads($this->normalizeResourceFilesFromRow($resource), []);
        }

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function toggleResource(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $resourceId = (int) $request->input('id', 0);
        DB::update(
            'UPDATE resources
             SET status = CASE
                 WHEN status = "Pending Review" THEN "Active"
                 WHEN status = "Active" THEN "Inactive"
                 ELSE "Active"
             END
             WHERE id = ?',
            [$resourceId]
        );

        $this->logAuditEvent('edit', 'resource', 'Changed a resource review status.', $resourceId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function createCategory(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireStaff();

        $name = trim((string) $request->input('name', ''));
        $description = trim((string) $request->input('description', ''));

        if ($name === '' || $description === '') {
            throw new LegacyApiException('Category name and description are required.', 422);
        }

        $categoryId = (int) DB::table('categories')->insertGetId([
            'slug' => $this->slugifyFilename($name),
            'name' => $name,
            'description' => $description,
        ]);

        $this->logAuditEvent('add', 'category', sprintf('Added category "%s".', $name), $categoryId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function updateCategory(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireStaff();

        $categoryId = (int) $request->input('id', 0);
        $name = trim((string) $request->input('name', ''));
        $description = trim((string) $request->input('description', ''));

        if ($categoryId <= 0 || $name === '' || $description === '') {
            throw new LegacyApiException('Category name and description are required.', 422);
        }

        DB::table('categories')->where('id', $categoryId)->update([
            'slug' => $this->slugifyFilename($name),
            'name' => $name,
            'description' => $description,
        ]);

        $this->logAuditEvent('edit', 'category', sprintf('Edited category "%s".', $name), $categoryId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function deleteCategory(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $categoryId = (int) $request->input('id', 0);
        if ((int) DB::table('resources')->where('category_id', $categoryId)->count() > 0) {
            throw new LegacyApiException('This category is in use by existing resources.', 422);
        }

        DB::table('categories')->where('id', $categoryId)->delete();
        $this->logAuditEvent('delete', 'category', 'Deleted a category.', $categoryId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function createUser(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $fullName = trim((string) $request->input('fullName', ''));
        $email = trim((string) $request->input('email', ''));
        $username = trim((string) $request->input('username', ''));
        $password = trim((string) $request->input('password', ''));
        $role = trim((string) $request->input('role', ''));

        if ($fullName === '' || $email === '' || $username === '' || $password === '' || !in_array($role, ['Administrator', 'Encoder'], true)) {
            throw new LegacyApiException('Please complete all required user fields.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new LegacyApiException('Please enter a valid email address.', 422);
        }

        $createdUserId = (int) DB::table('users')->insertGetId([
            'full_name' => $fullName,
            'email' => $email,
            'profile_image' => null,
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role,
            'status' => 'Active',
        ]);

        $this->logAuditEvent('add', 'user', sprintf('Added user account "%s".', $fullName), $createdUserId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function updateProfile(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);

        $userId = (int) (session('user.id') ?? 0);
        if ($userId <= 0) {
            throw new LegacyApiException('Unauthorized.', 401);
        }

        $fullName = trim((string) $request->input('fullName', ''));
        $email = trim((string) $request->input('email', ''));

        if ($fullName === '' || $email === '') {
            throw new LegacyApiException('Name and email are required.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new LegacyApiException('Please enter a valid email address.', 422);
        }

        $existingRow = DB::table('users')
            ->select('profile_image', 'username', 'role', 'status')
            ->where('id', $userId)
            ->first();

        if (!$existingRow) {
            throw new LegacyApiException('User account not found.', 404);
        }

        $existing = (array) $existingRow;
        $profileImage = $existing['profile_image'] ?? null;
        if ($request->hasFile('profileImage')) {
            $profileImage = $this->storeProfileImage($request->file('profileImage'), $profileImage);
        }

        DB::table('users')->where('id', $userId)->update([
            'full_name' => $fullName,
            'email' => $email,
            'profile_image' => $profileImage,
        ]);

        session([
            'user' => [
                'id' => $userId,
                'full_name' => $fullName,
                'email' => $email,
                'profile_image' => $profileImage,
                'username' => session('user.username', $existing['username'] ?? ''),
                'role' => session('user.role', $existing['role'] ?? ''),
                'status' => session('user.status', $existing['status'] ?? 'Active'),
            ],
        ]);

        $this->logAuditEvent('edit', 'profile', 'Updated personal profile information.', $userId);

        return $this->respond([
            'ok' => true,
            'session' => $this->currentSessionPayload(),
            'db' => $this->databasePayload(true),
        ]);
    }

    protected function changePassword(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);

        $userId = (int) (session('user.id') ?? 0);
        if ($userId <= 0) {
            throw new LegacyApiException('Unauthorized.', 401);
        }

        $currentPassword = trim((string) $request->input('currentPassword', ''));
        $newPassword = trim((string) $request->input('newPassword', ''));
        $confirmPassword = trim((string) $request->input('confirmPassword', ''));

        if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
            throw new LegacyApiException('Please complete all password fields.', 422);
        }

        if (strlen($newPassword) < 8) {
            throw new LegacyApiException('New password must be at least 8 characters long.', 422);
        }

        if ($newPassword !== $confirmPassword) {
            throw new LegacyApiException('New password and confirmation do not match.', 422);
        }

        if ($currentPassword === $newPassword) {
            throw new LegacyApiException('New password must be different from your current password.', 422);
        }

        $user = DB::table('users')
            ->select('password_hash')
            ->where('id', $userId)
            ->first();

        if (!$user || !password_verify($currentPassword, $user->password_hash)) {
            throw new LegacyApiException('Current password is incorrect.', 422);
        }

        DB::table('users')->where('id', $userId)->update([
            'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
        ]);

        $this->logAuditEvent('edit', 'account', 'Changed account password.', $userId);

        return $this->respond([
            'ok' => true,
            'session' => $this->currentSessionPayload(),
            'db' => $this->databasePayload(true),
        ]);
    }

    protected function updateSettings(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $siteTitle = trim((string) $request->input('siteTitle', ''));
        $siteDescription = trim((string) $request->input('siteDescription', ''));

        if ($siteTitle === '' || $siteDescription === '') {
            throw new LegacyApiException('Title and description are required.', 422);
        }

        $currentLogo = $this->settingsPayload()['logoUrl'] ?? '';
        $logoUrl = $currentLogo;

        if ($request->hasFile('siteLogo')) {
            $logoUrl = $this->storeSiteLogo($request->file('siteLogo'), $currentLogo ?: null);
        }

        DB::table('app_settings')->updateOrInsert(['setting_key' => 'site_title'], ['setting_value' => $siteTitle]);
        DB::table('app_settings')->updateOrInsert(['setting_key' => 'site_description'], ['setting_value' => $siteDescription]);
        DB::table('app_settings')->updateOrInsert(['setting_key' => 'site_logo_url'], ['setting_value' => $logoUrl]);

        $this->logAuditEvent('edit', 'settings', 'Updated site title and description.');

        return $this->respond([
            'ok' => true,
            'db' => $this->databasePayload(true),
            'session' => $this->currentSessionPayload(),
        ]);
    }

    protected function toggleUser(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $userId = (int) $request->input('id', 0);
        DB::update(
            'UPDATE users SET status = CASE WHEN status = "Active" THEN "Inactive" ELSE "Active" END WHERE id = ?',
            [$userId]
        );

        $this->logAuditEvent('edit', 'user', 'Changed a user account status.', $userId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function deleteUser(Request $request, string $method): JsonResponse
    {
        $this->ensureMethod('POST', $method);
        $this->requireAdministrator();

        $userId = (int) $request->input('id', 0);
        if ((int) (session('user.id') ?? 0) === $userId) {
            throw new LegacyApiException('You cannot delete the account you are currently using.', 422);
        }

        DB::table('users')->where('id', $userId)->delete();
        $this->logAuditEvent('delete', 'user', 'Deleted a user account.', $userId);

        return $this->respond(['ok' => true, 'db' => $this->databasePayload(true)]);
    }

    protected function databasePayload(bool $includeStaffData): array
    {
        $categories = DB::table('categories')
            ->select('id', 'slug', 'name', 'description')
            ->orderBy('name')
            ->get()
            ->map(fn ($category) => [
                'id' => (int) $category->id,
                'slug' => $category->slug,
                'name' => $category->name,
                'description' => $category->description,
            ])
            ->all();

        $resourceQuery = DB::table('resources as r')
            ->join('categories as c', 'c.id', '=', 'r.category_id')
            ->select(
                'r.id',
                'r.title',
                'r.description',
                'r.category_id',
                'c.name as category_name',
                'r.file_type',
                'r.keywords_json',
                'r.author_source',
                'r.upload_date',
                'r.status',
                'r.views',
                'r.source_mode',
                'r.resource_url',
                'r.data_text',
                'r.original_filename',
                'r.attachments_json',
                'r.stored_filename',
                'r.mime_type'
            );

        if (!$includeStaffData) {
            $resourceQuery->where('r.status', 'Active');
        }

        $resources = $resourceQuery
            ->orderByDesc('r.upload_date')
            ->orderByDesc('r.id')
            ->get()
            ->map(fn ($row) => $this->normalizeResourceRow((array) $row))
            ->all();

        $payload = [
            'settings' => $this->settingsPayload(),
            'categories' => $categories,
            'resources' => $resources,
        ];

        if ($includeStaffData) {
            $payload['users'] = DB::table('users')
                ->select('id', 'full_name', 'email', 'profile_image', 'username', 'role', 'status')
                ->orderBy('full_name')
                ->get()
                ->map(fn ($user) => [
                    'id' => (int) $user->id,
                    'fullName' => $user->full_name,
                    'email' => $user->email,
                    'profileImage' => $user->profile_image,
                    'username' => $user->username,
                    'role' => $user->role,
                    'status' => $user->status,
                ])
                ->all();

            if ((session('user.role') ?? '') === 'Administrator') {
                $payload['auditLogs'] = DB::table('audit_logs')
                    ->select('id', 'user_id', 'actor_name', 'actor_username', 'actor_role', 'action_type', 'entity_type', 'description', 'target_id', 'created_at')
                    ->orderByDesc('created_at')
                    ->orderByDesc('id')
                    ->limit(200)
                    ->get()
                    ->map(fn ($log) => [
                        'id' => (int) $log->id,
                        'userId' => $log->user_id !== null ? (int) $log->user_id : null,
                        'actorName' => $log->actor_name,
                        'actorUsername' => $log->actor_username,
                        'actorRole' => $log->actor_role,
                        'actionType' => $log->action_type,
                        'entityType' => $log->entity_type,
                        'description' => $log->description,
                        'targetId' => $log->target_id !== null ? (int) $log->target_id : null,
                        'createdAt' => $log->created_at,
                    ])
                    ->all();
            } else {
                $payload['auditLogs'] = [];
            }
        } else {
            $payload['users'] = [];
            $payload['auditLogs'] = [];
        }

        return $payload;
    }

    protected function settingsPayload(): array
    {
        $settings = DB::table('app_settings')
            ->select('setting_key', 'setting_value')
            ->get()
            ->pluck('setting_value', 'setting_key');

        $logoUrl = $settings['site_logo_url'] ?? '';
        $logoUpdatedAt = '';
        if ($logoUrl !== '') {
            $logoPath = $this->uploadDir() . DIRECTORY_SEPARATOR . basename((string) $logoUrl);
            if (is_file($logoPath)) {
                $logoUpdatedAt = (string) filemtime($logoPath);
            }
        }

        return [
            'siteTitle' => $settings['site_title'] ?? 'Learning Resource System',
            'siteDescription' => $settings['site_description'] ?? 'School of Fisheries',
            'logoUrl' => $logoUrl,
            'logoUpdatedAt' => $logoUpdatedAt,
        ];
    }

    protected function currentSessionPayload(): ?array
    {
        if (!session()->has('user')) {
            return null;
        }

        $user = session('user');

        return [
            'id' => (int) $user['id'],
            'fullName' => $user['full_name'],
            'email' => $user['email'] ?? null,
            'profileImage' => $user['profile_image'] ?? null,
            'username' => $user['username'] ?? '',
            'role' => $user['role'] ?? '',
            'status' => $user['status'] ?? 'Active',
        ];
    }

    protected function isStaff(): bool
    {
        return in_array(session('user.role'), ['Administrator', 'Encoder'], true);
    }

    protected function requireStaff(): void
    {
        if (!$this->isStaff()) {
            throw new LegacyApiException('Unauthorized.', 401);
        }
    }

    protected function requireAdministrator(): void
    {
        if (session('user.role') !== 'Administrator') {
            throw new LegacyApiException('Administrator access required.', 403);
        }
    }

    protected function logAuditEvent(string $actionType, string $entityType, string $description, ?int $targetId = null, ?array $actor = null): void
    {
        $actorData = $actor ?? session('user');
        if (!$actorData) {
            return;
        }

        DB::table('audit_logs')->insert([
            'user_id' => isset($actorData['id']) ? (int) $actorData['id'] : null,
            'actor_name' => (string) ($actorData['full_name'] ?? $actorData['actor_name'] ?? 'Unknown User'),
            'actor_username' => (string) ($actorData['username'] ?? $actorData['actor_username'] ?? ''),
            'actor_role' => (string) ($actorData['role'] ?? $actorData['actor_role'] ?? ''),
            'action_type' => $actionType,
            'entity_type' => $entityType,
            'description' => $description,
            'target_id' => $targetId,
        ]);
    }

    protected function normalizeResourceRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'categoryId' => (int) $row['category_id'],
            'categoryName' => $row['category_name'],
            'fileType' => $row['file_type'],
            'keywords' => json_decode((string) $row['keywords_json'], true) ?: [],
            'authorSource' => $row['author_source'],
            'uploadDate' => $row['upload_date'],
            'status' => $row['status'],
            'views' => (int) $row['views'],
            'sourceMode' => $row['source_mode'],
            'resourceUrl' => $row['resource_url'],
            'dataText' => $row['data_text'],
            'originalFilename' => $row['original_filename'],
            'files' => $this->normalizeResourceFilesFromRow($row),
        ];
    }

    protected function normalizeKeywords(string $keywordsString): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $keywordsString)), static fn (string $keyword): bool => $keyword !== ''));
    }

    protected function normalizeResourceFilesFromRow(array $row): array
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

    protected function resourceFileSignature(array $file): string
    {
        return sha1(json_encode([
            'storedFilename' => $file['storedFilename'] ?? null,
            'resourceUrl' => $file['resourceUrl'] ?? null,
            'originalFilename' => $file['originalFilename'] ?? null,
            'mimeType' => $file['mimeType'] ?? null,
            'fileType' => $file['fileType'] ?? null,
            'dataTextHash' => isset($file['dataText']) ? sha1((string) $file['dataText']) : null,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    protected function filterRetainedExistingFiles(array $existingFiles, mixed $retainedPayload): array
    {
        if ($retainedPayload === null || $retainedPayload === '') {
            return $existingFiles;
        }

        $decoded = json_decode((string) $retainedPayload, true);
        if (!is_array($decoded)) {
            return $existingFiles;
        }

        $allowedSignatures = [];
        foreach ($decoded as $file) {
            if (!is_array($file)) {
                continue;
            }

            $allowedSignatures[] = $this->resourceFileSignature([
                'storedFilename' => $file['storedFilename'] ?? null,
                'resourceUrl' => $file['resourceUrl'] ?? null,
                'originalFilename' => $file['originalFilename'] ?? null,
                'mimeType' => $file['mimeType'] ?? null,
                'fileType' => $file['fileType'] ?? null,
                'dataText' => $file['dataText'] ?? null,
            ]);
        }

        if (!$allowedSignatures) {
            return [];
        }

        return array_values(array_filter($existingFiles, fn (array $file): bool => in_array($this->resourceFileSignature($file), $allowedSignatures, true)));
    }

    protected function buildResourceFiles(string $title, string $resourceUrl, string $dataText, UploadedFile|array|null $uploadFile, array $existingFiles): array
    {
        $uploadedFiles = $this->normalizeUploadedFiles($uploadFile);
        if (count($uploadedFiles) > 20) {
            throw new LegacyApiException('You can upload up to 20 files at a time.', 422);
        }

        if ($uploadedFiles) {
            $storedFiles = $this->storeUploadedFiles($uploadedFiles);

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
                    'originalFilename' => $this->slugifyFilename($title) . '.txt',
                    'mimeType' => 'text/plain',
                ]],
                'fileType' => 'Data',
                'replacedExisting' => true,
            ];
        }

        if ($resourceUrl !== '') {
            $detectedType = $this->detectFileTypeFromName((string) parse_url($resourceUrl, PHP_URL_PATH));

            return [
                'files' => [[
                    'fileType' => $detectedType,
                    'sourceMode' => 'url',
                    'resourceUrl' => $resourceUrl,
                    'dataText' => null,
                    'storedFilename' => null,
                    'originalFilename' => basename((string) parse_url($resourceUrl, PHP_URL_PATH)) ?: $this->slugifyFilename($title),
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

    protected function normalizeUploadedFiles(UploadedFile|array|null $uploadFile): array
    {
        if ($uploadFile === null) {
            return [];
        }

        if ($uploadFile instanceof UploadedFile) {
            return [$uploadFile];
        }

        return array_values(array_filter($uploadFile, fn ($file): bool => $file instanceof UploadedFile));
    }

    protected function storeUploadedFiles(array $uploadedFiles): array
    {
        $stored = [];

        foreach ($uploadedFiles as $uploadFile) {
            if (!$uploadFile instanceof UploadedFile || !$uploadFile->isValid()) {
                throw new LegacyApiException('File upload failed.', 422);
            }

            $originalName = $uploadFile->getClientOriginalName();
            $mimeType = $uploadFile->getMimeType() ?: 'application/octet-stream';
            $fileType = $this->detectFileTypeFromName($originalName);
            if (!in_array($fileType, ['PDF', 'Video', 'Data'], true)) {
                throw new LegacyApiException('One of the uploaded files has an unsupported type.', 422);
            }

            $extension = strtolower($uploadFile->getClientOriginalExtension());
            $storedFilename = uniqid('upload_', true) . ($extension !== '' ? '.' . $extension : '');
            $uploadFile->move($this->uploadDir(), $storedFilename);

            $relativeUrl = 'uploads/' . rawurlencode($storedFilename);
            $stored[] = [
                'fileType' => $fileType,
                'sourceMode' => $fileType === 'Data' ? 'text' : 'upload',
                'resourceUrl' => $fileType === 'Data' ? null : $relativeUrl,
                'dataText' => $fileType === 'Data' ? (string) file_get_contents($this->uploadDir() . DIRECTORY_SEPARATOR . $storedFilename) : null,
                'storedFilename' => $storedFilename,
                'originalFilename' => $originalName,
                'mimeType' => $mimeType,
            ];
        }

        return $stored;
    }

    protected function storeProfileImage(UploadedFile $uploadFile, ?string $existingImage = null): string
    {
        if (!$uploadFile->isValid()) {
            throw new LegacyApiException('Profile image upload failed.', 422);
        }

        $extension = strtolower($uploadFile->getClientOriginalExtension());
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            throw new LegacyApiException('Profile image must be JPG, PNG, or WEBP.', 422);
        }

        $storedFilename = uniqid('profile_', true) . '.' . $extension;
        $uploadFile->move($this->uploadDir(), $storedFilename);

        if ($existingImage) {
            $this->deleteUploadByRelativePath($existingImage);
        }

        return 'uploads/' . rawurlencode($storedFilename);
    }

    protected function storeSiteLogo(UploadedFile $uploadFile, ?string $existingLogo = null): string
    {
        if (!$uploadFile->isValid()) {
            throw new LegacyApiException('Logo upload failed.', 422);
        }

        $extension = strtolower($uploadFile->getClientOriginalExtension());
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'svg'], true)) {
            throw new LegacyApiException('Logo must be JPG, PNG, WEBP, or SVG.', 422);
        }

        $storedFilename = uniqid('logo_', true) . '.' . $extension;
        $uploadFile->move($this->uploadDir(), $storedFilename);

        if ($existingLogo) {
            $this->deleteUploadByRelativePath($existingLogo);
        }

        return 'uploads/' . rawurlencode($storedFilename);
    }

    protected function cleanupRemovedUploads(array $previousFiles, array $currentFiles): void
    {
        $currentStored = array_filter(array_map(static fn (array $file): ?string => $file['storedFilename'] ?? null, $currentFiles));

        foreach ($previousFiles as $file) {
            $storedFilename = $file['storedFilename'] ?? null;
            if ($storedFilename && !in_array($storedFilename, $currentStored, true)) {
                $path = $this->uploadDir() . DIRECTORY_SEPARATOR . $storedFilename;
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }
    }

    protected function deleteUploadByRelativePath(string $relativePath): void
    {
        $filename = basename($relativePath);
        $path = $this->uploadDir() . DIRECTORY_SEPARATOR . $filename;
        if (is_file($path)) {
            @unlink($path);
        }
    }

    protected function detectFileTypeFromName(string $filename): string
    {
        return match (strtolower((string) pathinfo($filename, PATHINFO_EXTENSION))) {
            'pdf' => 'PDF',
            'mp4', 'mov', 'avi', 'webm', 'mkv' => 'Video',
            'csv', 'json', 'txt' => 'Data',
            default => '',
        };
    }

    protected function slugifyFilename(string $value): string
    {
        $slug = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $value), '-'));

        return $slug !== '' ? $slug : 'resource';
    }

    protected function ensureMethod(string $expected, string $actual): void
    {
        if (strtoupper($expected) !== strtoupper($actual)) {
            throw new LegacyApiException('Method not allowed.', 405);
        }
    }

    protected function requestExceedsPostMaxSize(Request $request): bool
    {
        $contentLength = (int) $request->server('CONTENT_LENGTH', 0);
        $maxBytes = $this->postMaxSizeBytes();

        return $contentLength > 0 && $maxBytes > 0 && $contentLength > $maxBytes && strtoupper($request->method()) === 'POST';
    }

    protected function postMaxSizeBytes(): int
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

    protected function readableBytes(int $bytes): string
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

    protected function respond(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    protected function uploadDir(): string
    {
        $path = public_path('uploads');
        if (!is_dir($path)) {
            mkdir($path, 0777, true);
        }

        return $path;
    }
}
