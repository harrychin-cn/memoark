package com.memoark.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

public final class MemoArkShareProvider extends ContentProvider {
    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        String requestedMime = uri.getQueryParameter("mime");
        if (requestedMime != null && !requestedMime.trim().isEmpty()) {
            return requestedMime;
        }
        String extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        String inferred = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return inferred == null ? "application/octet-stream" : inferred;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file;
        try {
            file = resolveFile(uri);
        } catch (FileNotFoundException error) {
            return null;
        }
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) {
                row.add(file.getName());
            } else if (OpenableColumns.SIZE.equals(column)) {
                row.add(file.length());
            } else {
                row.add(null);
            }
        }
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) {
            throw new FileNotFoundException("MemoArk share files are read-only");
        }
        return ParcelFileDescriptor.open(resolveFile(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    private File resolveFile(Uri uri) throws FileNotFoundException {
        if (getContext() == null || uri.getPathSegments().size() != 2 || !"share".equals(uri.getPathSegments().get(0))) {
            throw new FileNotFoundException("Invalid share URI");
        }
        File root = new File(getContext().getCacheDir(), "shares");
        File requested = new File(root, uri.getPathSegments().get(1));
        try {
            if (!requested.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator) || !requested.isFile()) {
                throw new FileNotFoundException("Share file not found");
            }
        } catch (IOException error) {
            throw new FileNotFoundException(error.getMessage());
        }
        return requested;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read only");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read only");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read only");
    }
}
