package com.muvidate.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidFullScreen")
public class AndroidFullScreenPlugin extends Plugin {

    @PluginMethod
    public void enterVideoFullscreen(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity is null");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // 1. Switch activity to sensor-based landscape (supports both landscape directions)
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

                // 2. Hide status bar and navigation bar using WindowInsetsControllerCompat for immersive mode
                Window window = getActivity().getWindow();
                WindowCompat.setDecorFitsSystemWindows(window, false);

                // Enable display cutout mode so fullscreen video can extend into the notch area
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(lp);
                }

                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                }

                // Prevent screen timeout during fullscreen playback
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void exitVideoFullscreen(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity is null");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // 1. Restore portrait orientation
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

                // 2. Restore normal system bars
                Window window = getActivity().getWindow();
                WindowCompat.setDecorFitsSystemWindows(window, true);

                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.show(WindowInsetsCompat.Type.systemBars());
                }

                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void isNative(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNative", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstagram(PluginCall call) {
        String username = call.getString("username", "ashuuxoo");
        if (getActivity() == null) {
            call.reject("Activity is null");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // 1. Try native Instagram app intent
                Uri appUri = Uri.parse("http://instagram.com/_u/" + username);
                Intent appIntent = new Intent(Intent.ACTION_VIEW, appUri);
                appIntent.setPackage("com.instagram.android");
                appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                try {
                    getContext().startActivity(appIntent);
                    call.resolve();
                } catch (Exception notInstalled) {
                    // 2. Fallback to system browser
                    Uri webUri = Uri.parse("https://www.instagram.com/" + username);
                    Intent webIntent = new Intent(Intent.ACTION_VIEW, webUri);
                    webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(webIntent);
                    call.resolve();
                }
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
