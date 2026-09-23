package com.muvidate.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.activity.result.ActivityResult;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@UnstableApi
@CapacitorPlugin(name = "AndroidNativeMedia")
public class AndroidNativeMediaPlugin extends Plugin {

    private ExoPlayer exoPlayer;
    private FrameLayout playerContainer;
    private AspectRatioFrameLayout aspectRatioLayout;
    private TextureView textureView;
    private String currentUriString = null;
    private String lastErrorMessage = null;
    private boolean isPlayerReady = false;

    @PluginMethod
    public void pickOfflineVideo(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");

        // Allow any standard or extended video container types without artificial restrictions
        String[] mimeTypes = new String[] {
            "video/*",
            "application/x-matroska",
            "application/octet-stream"
        };
        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

        startActivityForResult(call, intent, "handleVideoPickerResult");
    }

    @ActivityCallback
    private void handleVideoPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("USER_CANCELLED", "No video file was selected.");
            return;
        }

        Uri uri = result.getData().getData();

        // Persist URI read permission across activity lifecycles
        try {
            int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (Exception e) {
            // Some URI providers don't support persistable permissions, continue with standard grant
        }

        String displayName = "offline_video";
        long fileSize = 0;

        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1) {
                    displayName = cursor.getString(nameIndex);
                }
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex != -1) {
                    fileSize = cursor.getLong(sizeIndex);
                }
            }
        } catch (Exception ignored) {}

        if (displayName == null || displayName.isEmpty()) {
            displayName = uri.getLastPathSegment();
            if (displayName == null) displayName = "offline_video.mp4";
        }

        // Extract duration accurately using MediaMetadataRetriever
        double durationInSeconds = 0;
        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            retriever.setDataSource(getContext(), uri);
            String durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (durationStr != null) {
                long durationMs = Long.parseLong(durationStr);
                if (durationMs > 0) {
                    durationInSeconds = durationMs / 1000.0;
                }
            }
            retriever.release();
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("name", displayName);
        ret.put("size", fileSize);
        ret.put("duration", durationInSeconds);

        call.resolve(ret);
    }

    @PluginMethod
    public void getVideoDuration(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("Missing URI parameter");
            return;
        }

        Uri uri = Uri.parse(uriStr);
        double durationInSeconds = 0;

        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            retriever.setDataSource(getContext(), uri);
            String durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (durationStr != null) {
                long durationMs = Long.parseLong(durationStr);
                if (durationMs > 0) {
                    durationInSeconds = durationMs / 1000.0;
                }
            }
            retriever.release();
        } catch (Exception e) {
            call.reject("Could not extract duration: " + e.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("duration", durationInSeconds);
        call.resolve(ret);
    }

    @PluginMethod
    public void setupPlayer(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("Missing video URI");
            return;
        }

        final double position = call.getDouble("position", 0.0);
        final boolean autoPlay = call.getBoolean("autoPlay", false);
        this.currentUriString = uriStr;
        this.lastErrorMessage = null;
        this.isPlayerReady = false;

        getActivity().runOnUiThread(() -> {
            try {
                initNativePlayerView();

                if (exoPlayer == null) {
                    exoPlayer = new ExoPlayer.Builder(getContext()).build();
                    if (textureView != null) {
                        exoPlayer.setVideoTextureView(textureView);
                    }

                    exoPlayer.addListener(new Player.Listener() {
                        @Override
                        public void onPlaybackStateChanged(int playbackState) {
                            if (playbackState == Player.STATE_READY) {
                                isPlayerReady = true;
                                notifyPlayerState();
                            } else if (playbackState == Player.STATE_ENDED) {
                                JSObject data = new JSObject();
                                data.put("event", "ended");
                                notifyListeners("nativeVideoEnded", data);
                            }
                        }

                        @Override
                        public void onVideoSizeChanged(VideoSize videoSize) {
                            if (videoSize.width > 0 && videoSize.height > 0 && aspectRatioLayout != null) {
                                float ratio = (float) videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height;
                                aspectRatioLayout.setAspectRatio(ratio);
                            }
                        }

                        @Override
                        public void onIsPlayingChanged(boolean isPlaying) {
                            notifyPlayerState();
                        }

                        @Override
                        public void onPlayerError(PlaybackException error) {
                            isPlayerReady = false;
                            lastErrorMessage = "This video codec or audio track is not supported by this Android device.";
                            JSObject errObj = new JSObject();
                            errObj.put("error", lastErrorMessage);
                            errObj.put("errorCode", error.errorCode);
                            errObj.put("message", error.getMessage());
                            notifyListeners("nativeVideoError", errObj);
                        }
                    });
                } else if (textureView != null) {
                    exoPlayer.setVideoTextureView(textureView);
                }

                Uri videoUri = Uri.parse(uriStr);
                MediaItem mediaItem = MediaItem.fromUri(videoUri);
                exoPlayer.setMediaItem(mediaItem);

                if (position > 0) {
                    exoPlayer.seekTo((long) (position * 1000));
                }

                exoPlayer.setPlayWhenReady(autoPlay);
                exoPlayer.prepare();

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to initialize native Media3 player: " + e.getMessage());
            }
        });
    }

    private void initNativePlayerView() {
        if (textureView != null && playerContainer != null) return;

        Activity activity = getActivity();
        if (activity == null) return;

        ViewGroup root = (ViewGroup) activity.findViewById(android.R.id.content);
        if (root == null) return;

        playerContainer = new FrameLayout(activity);
        FrameLayout.LayoutParams containerLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        containerLp.gravity = Gravity.TOP | Gravity.START;
        playerContainer.setLayoutParams(containerLp);
        playerContainer.setBackgroundColor(Color.TRANSPARENT);
        playerContainer.setVisibility(View.GONE);

        aspectRatioLayout = new AspectRatioFrameLayout(activity);
        aspectRatioLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        aspectRatioLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        textureView = new TextureView(activity);
        textureView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        ));

        aspectRatioLayout.addView(textureView);
        playerContainer.addView(aspectRatioLayout);

        // Add native player container behind the WebView (index 0)
        root.addView(playerContainer, 0);

        // Ensure WebView background is transparent so native TextureView is visible through transparent cutouts
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }
    }

    @PluginMethod
    public void updatePlayerBounds(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }

        final double x = call.getDouble("x", 0.0);
        final double y = call.getDouble("y", 0.0);
        final double width = call.getDouble("width", 0.0);
        final double height = call.getDouble("height", 0.0);
        final boolean visible = call.getBoolean("visible", true);
        final boolean isFullscreen = call.getBoolean("isFullscreen", false);

        getActivity().runOnUiThread(() -> {
            if (playerContainer == null || textureView == null) {
                initNativePlayerView();
            }

            if (playerContainer == null) {
                call.resolve();
                return;
            }

            if (!visible || width <= 0 || height <= 0) {
                playerContainer.setVisibility(View.GONE);
                call.resolve();
                return;
            }

            playerContainer.setVisibility(View.VISIBLE);

            DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
            float density = dm.density;

            if (isFullscreen) {
                FrameLayout.LayoutParams fullLp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
                fullLp.gravity = Gravity.TOP | Gravity.START;
                fullLp.leftMargin = 0;
                fullLp.topMargin = 0;
                playerContainer.setLayoutParams(fullLp);
                playerContainer.setTranslationX(0);
                playerContainer.setTranslationY(0);
            } else {
                int pixelWidth = (int) Math.round(width * density);
                int pixelHeight = (int) Math.round(height * density);
                int pixelX = (int) Math.round(x * density);
                int pixelY = (int) Math.round(y * density);

                FrameLayout.LayoutParams inlineLp = new FrameLayout.LayoutParams(pixelWidth, pixelHeight);
                inlineLp.gravity = Gravity.TOP | Gravity.START;
                inlineLp.leftMargin = pixelX;
                inlineLp.topMargin = pixelY;
                playerContainer.setLayoutParams(inlineLp);
                playerContainer.setTranslationX(0);
                playerContainer.setTranslationY(0);
            }

            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (exoPlayer != null) {
                exoPlayer.play();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (exoPlayer != null) {
                exoPlayer.pause();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double position = call.getDouble("position", 0.0);
        getActivity().runOnUiThread(() -> {
            if (exoPlayer != null) {
                exoPlayer.seekTo((long) (position * 1000));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volObj = call.getDouble("volume", 1.0);
        float volume = volObj != null ? volObj.floatValue() : 1.0f;
        getActivity().runOnUiThread(() -> {
            if (exoPlayer != null) {
                exoPlayer.setVolume(Math.max(0f, Math.min(1f, volume)));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setDisplayMode(PluginCall call) {
        String mode = call.getString("mode", "fit");
        getActivity().runOnUiThread(() -> {
            if (aspectRatioLayout != null) {
                if ("zoom".equalsIgnoreCase(mode)) {
                    aspectRatioLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
                } else if ("stretch".equalsIgnoreCase(mode)) {
                    aspectRatioLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                } else {
                    aspectRatioLayout.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            if (exoPlayer != null) {
                long curMs = exoPlayer.getCurrentPosition();
                long durMs = exoPlayer.getDuration();
                boolean isPlaying = exoPlayer.isPlaying();
                boolean isBuffering = exoPlayer.getPlaybackState() == Player.STATE_BUFFERING;

                ret.put("currentTime", curMs > 0 ? curMs / 1000.0 : 0.0);
                ret.put("duration", durMs > 0 ? durMs / 1000.0 : 0.0);
                ret.put("isPlaying", isPlaying);
                ret.put("isBuffering", isBuffering);
                ret.put("isReady", isPlayerReady);
                if (lastErrorMessage != null) {
                    ret.put("error", lastErrorMessage);
                }
            } else {
                ret.put("currentTime", 0.0);
                ret.put("duration", 0.0);
                ret.put("isPlaying", false);
                ret.put("isBuffering", false);
                ret.put("isReady", false);
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cleanupPlayer();
            call.resolve();
        });
    }

    private void cleanupPlayer() {
        if (exoPlayer != null) {
            try {
                if (textureView != null) {
                    exoPlayer.clearVideoTextureView(textureView);
                }
                exoPlayer.stop();
                exoPlayer.release();
            } catch (Exception ignored) {}
            exoPlayer = null;
        }
        if (playerContainer != null) {
            playerContainer.setVisibility(View.GONE);
        }
        currentUriString = null;
        lastErrorMessage = null;
        isPlayerReady = false;
    }

    private void notifyPlayerState() {
        if (exoPlayer == null) return;
        JSObject data = new JSObject();
        data.put("isPlaying", exoPlayer.isPlaying());
        data.put("currentTime", exoPlayer.getCurrentPosition() / 1000.0);
        data.put("duration", exoPlayer.getDuration() > 0 ? exoPlayer.getDuration() / 1000.0 : 0.0);
        data.put("isBuffering", exoPlayer.getPlaybackState() == Player.STATE_BUFFERING);
        notifyListeners("nativePlayerStateChange", data);
    }

    @Override
    protected void handleOnDestroy() {
        cleanupPlayer();
        super.handleOnDestroy();
    }
}
