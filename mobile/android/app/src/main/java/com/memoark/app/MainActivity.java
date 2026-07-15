package com.memoark.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.memoark.mobile.mobilebackend.Mobilebackend;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class MainActivity extends Activity {
    private static final String TAG = "MemoArk";
    private static final String LOCAL_HOST = "127.0.0.1";
    private static final int LOCAL_PORT = 5230;
    private static final String LOCAL_URL = "http://" + LOCAL_HOST + ":" + LOCAL_PORT + "/";
    private static final int REQUEST_OPEN_FILE = 1001;
    private static final int REQUEST_SAVE_FILE = 1002;

    private final ExecutorService backendExecutor = Executors.newSingleThreadExecutor();
    private final String bridgeToken = UUID.randomUUID().toString();
    private WebView webView;
    private ProgressBar progressBar;
    private TextView statusView;
    private ValueCallback<Uri[]> filePathCallback;
    private File pendingSaveFile;
    private String pendingSaveMimeType;
    private volatile boolean lifecycleStarted;
    private boolean initialPageLoaded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWebView();
    }

    @Override
    protected void onStart() {
        super.onStart();
        lifecycleStarted = true;
        startBackendAndLoad();
    }

    @Override
    protected void onStop() {
        lifecycleStarted = false;
        Future<?> shutdown = backendExecutor.submit(() -> {
            String error = Mobilebackend.stop();
            if (!error.isEmpty()) {
                Log.e(TAG, "Backend shutdown failed: " + error);
            }
        });
        try {
            shutdown.get(4, TimeUnit.SECONDS);
        } catch (Exception error) {
            Log.e(TAG, "Timed out while closing the local database", error);
        }
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("MemoArkAndroid");
            webView.destroy();
        }
        backendExecutor.shutdown();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        moveTaskToBack(true);
    }

    private void configureWebView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(250, 250, 250));

        webView = new WebView(this);
        webView.setVisibility(View.INVISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(64, 64);
        progressParams.gravity = android.view.Gravity.CENTER;
        root.addView(progressBar, progressParams);

        statusView = new TextView(this);
        statusView.setText(R.string.starting);
        statusView.setTextColor(Color.DKGRAY);
        statusView.setGravity(android.view.Gravity.CENTER);
        statusView.setPadding(48, 160, 48, 48);
        root.addView(statusView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        CookieManager.getInstance().setAcceptCookie(true);
        webView.addJavascriptInterface(new AndroidBridge(), "MemoArkAndroid");
        webView.setWebViewClient(new LocalOnlyWebViewClient());
        webView.setWebChromeClient(new MemoArkWebChromeClient());
        webView.setDownloadListener(new MemoArkDownloadListener());
    }

    private void startBackendAndLoad() {
        backendExecutor.execute(() -> {
            String dataDirectory = new File(getFilesDir(), "memoark").getAbsolutePath();
            String error = Mobilebackend.start(dataDirectory, LOCAL_PORT);
            runOnUiThread(() -> {
                if (!lifecycleStarted || isFinishing()) {
                    return;
                }
                if (!error.isEmpty()) {
                    showFatalError(getString(R.string.backend_start_failed, error));
                    return;
                }
                if (!initialPageLoaded) {
                    initialPageLoaded = true;
                    webView.loadUrl(LOCAL_URL);
                }
            });
        });
    }

    private void showFatalError(String message) {
        progressBar.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        statusView.setVisibility(View.VISIBLE);
        statusView.setText(message);
    }

    private boolean isLocalUri(Uri uri) {
        return "http".equalsIgnoreCase(uri.getScheme()) && LOCAL_HOST.equals(uri.getHost()) && uri.getPort() == LOCAL_PORT;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private final class LocalOnlyWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocalUri(uri)) {
                return false;
            }
            openExternal(uri);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Uri uri = Uri.parse(url);
            if (!isLocalUri(uri)) {
                return;
            }
            view.evaluateJavascript("window.__MEMOARK_BRIDGE_TOKEN = " + JSONObject.quote(bridgeToken) + ";", null);
            progressBar.setVisibility(View.GONE);
            statusView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
        }
    }

    private final class MemoArkWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            String[] acceptedTypes = params.getAcceptTypes();
            if (acceptedTypes != null && acceptedTypes.length > 0 && !(acceptedTypes.length == 1 && acceptedTypes[0].isEmpty())) {
                intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedTypes);
            }
            try {
                startActivityForResult(intent, REQUEST_OPEN_FILE);
            } catch (Exception error) {
                filePathCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, R.string.no_file_picker, Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }
    }

    private final class MemoArkDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
            Uri uri = Uri.parse(url);
            if (!isLocalUri(uri)) {
                openExternal(uri);
                return;
            }
            try {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(uri);
                request.setMimeType(mimeType);
                request.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                request.addRequestHeader("User-Agent", userAgent);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(MainActivity.this, R.string.download_started, Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Log.e(TAG, "Unable to start download", error);
                Toast.makeText(MainActivity.this, R.string.download_failed, Toast.LENGTH_SHORT).show();
            }
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void saveFile(String token, String dataUrl, String filename, String mimeType) {
            if (!bridgeToken.equals(token)) {
                return;
            }
            backendExecutor.execute(() -> {
                try {
                    pendingSaveFile = decodeToCacheFile(dataUrl, filename, "exports");
                    pendingSaveMimeType = safeMimeType(mimeType);
                    runOnUiThread(() -> {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(pendingSaveMimeType);
                        intent.putExtra(Intent.EXTRA_TITLE, pendingSaveFile.getName());
                        startActivityForResult(intent, REQUEST_SAVE_FILE);
                    });
                } catch (Exception error) {
                    Log.e(TAG, "Unable to prepare exported file", error);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.export_failed, Toast.LENGTH_SHORT).show());
                }
            });
        }

        @JavascriptInterface
        public void shareFile(String token, String dataUrl, String filename, String mimeType, String title) {
            if (!bridgeToken.equals(token)) {
                return;
            }
            backendExecutor.execute(() -> {
                try {
                    File file = decodeToCacheFile(dataUrl, filename, "shares");
                    Uri uri = new Uri.Builder()
                            .scheme("content")
                            .authority(getPackageName() + ".share")
                            .appendPath("share")
                            .appendPath(file.getName())
                            .appendQueryParameter("mime", safeMimeType(mimeType))
                            .build();
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType(safeMimeType(mimeType));
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.putExtra(Intent.EXTRA_TITLE, title);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(() -> startActivity(Intent.createChooser(intent, getString(R.string.share_with))));
                } catch (Exception error) {
                    Log.e(TAG, "Unable to prepare shared file", error);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.share_failed, Toast.LENGTH_SHORT).show());
                }
            });
        }

        @JavascriptInterface
        public void shareText(String token, String text, String title) {
            if (!bridgeToken.equals(token)) {
                return;
            }
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.putExtra(Intent.EXTRA_TITLE, title);
            runOnUiThread(() -> startActivity(Intent.createChooser(intent, getString(R.string.share_with))));
        }
    }

    private File decodeToCacheFile(String dataUrl, String filename, String directoryName) throws IOException {
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.substring(0, comma).toLowerCase(Locale.ROOT).contains(";base64")) {
            throw new IOException("Unsupported data URL");
        }
        byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        File directory = new File(getCacheDir(), directoryName);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Unable to create cache directory");
        }
        File output = new File(directory, sanitizeFilename(filename));
        try (FileOutputStream stream = new FileOutputStream(output)) {
            stream.write(bytes);
        }
        return output;
    }

    private String sanitizeFilename(String filename) {
        String sanitized = (filename == null ? "" : filename).replaceAll("[^a-zA-Z0-9._\\-\\u4e00-\\u9fff]", "_");
        if (sanitized.isEmpty() || sanitized.equals(".") || sanitized.equals("..")) {
            return "memoark-export";
        }
        return sanitized.length() > 120 ? sanitized.substring(sanitized.length() - 120) : sanitized;
    }

    private String safeMimeType(String mimeType) {
        return mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType.split(";", 2)[0];
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_FILE) {
            ValueCallback<Uri[]> callback = filePathCallback;
            filePathCallback = null;
            if (callback == null) {
                return;
            }
            Uri[] results = fileChooserResults(resultCode, data);
            backendExecutor.execute(() -> {
                String error = Mobilebackend.start(new File(getFilesDir(), "memoark").getAbsolutePath(), LOCAL_PORT);
                runOnUiThread(() -> callback.onReceiveValue(error.isEmpty() ? results : null));
            });
            return;
        }
        if (requestCode == REQUEST_SAVE_FILE) {
            File source = pendingSaveFile;
            pendingSaveFile = null;
            pendingSaveMimeType = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && source != null) {
                Uri destination = data.getData();
                backendExecutor.execute(() -> copyExport(source, destination));
            } else if (source != null) {
                source.delete();
            }
        }
    }

    private Uri[] fileChooserResults(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null) {
            return null;
        }
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            Uri[] results = new Uri[clipData.getItemCount()];
            for (int index = 0; index < clipData.getItemCount(); index++) {
                results[index] = clipData.getItemAt(index).getUri();
            }
            return results;
        }
        return data.getData() == null ? null : new Uri[]{data.getData()};
    }

    private void copyExport(File source, Uri destination) {
        try (InputStream input = new java.io.FileInputStream(source);
             OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) {
                throw new IOException("Unable to open selected destination");
            }
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            runOnUiThread(() -> Toast.makeText(this, R.string.export_saved, Toast.LENGTH_SHORT).show());
        } catch (Exception error) {
            Log.e(TAG, "Unable to save exported file", error);
            runOnUiThread(() -> Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show());
        } finally {
            source.delete();
        }
    }
}
