<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>School of Fisheries Learning Resource System</title>
  <link id="appFavicon" rel="icon" data-default-icon="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230d6b57'/%3E%3Cpath d='M14 35c9-10 24-14 36-10-5 9-15 17-28 18-5 0-8-2-8-8Z' fill='%23f2b95c'/%3E%3Ccircle cx='44' cy='24' r='3' fill='white'/%3E%3C/svg%3E" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230d6b57'/%3E%3Cpath d='M14 35c9-10 24-14 36-10-5 9-15 17-28 18-5 0-8-2-8-8Z' fill='%23f2b95c'/%3E%3Ccircle cx='44' cy='24' r='3' fill='white'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{{ asset('styles.css') }}">
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#home" aria-label="School of Fisheries Learning Resource System">
        <span class="brand-mark">SF</span>
        <span>
          <strong>Learning Resource System</strong>
          <small>School of Fisheries</small>
        </span>
      </a>

      <nav class="topbar-nav" id="publicNav"></nav>

      <div class="topbar-actions" id="topbarActions"></div>
    </header>

    <main id="app"></main>
  </div>

  <template id="resourceCardTemplate">
    <article class="resource-card">
      <div class="resource-card__badge-row">
        <span class="pill pill--soft" data-role="category"></span>
        <span class="pill" data-role="type"></span>
      </div>
      <h3 data-role="title"></h3>
      <p data-role="description"></p>
      <div class="resource-meta">
        <span data-role="keywords"></span>
        <span data-role="date"></span>
      </div>
      <button class="button button--ghost" data-role="viewButton" type="button">View Resource</button>
    </article>
  </template>

  <script src="{{ asset('app.js') }}"></script>
</body>
</html>
