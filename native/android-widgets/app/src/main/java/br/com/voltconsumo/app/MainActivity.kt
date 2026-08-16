package br.com.voltconsumo.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import br.com.voltconsumo.app.widget.SnapshotStore
import br.com.voltconsumo.app.widget.WidgetRefresh
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pendingRoute: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingRoute = RouteParser.fromValue(intent?.dataString)
        webView = WebView(this)
        setContentView(
            webView,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        configureWebView()
        webView.loadUrl(WEB_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        RouteParser.fromValue(intent.dataString)?.let { route ->
            pendingRoute = route
            loadBridgeAndDispatch(route)
        }
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.setBackgroundColor(Color.TRANSPARENT)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.setSupportMultipleWindows(false)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                BRIDGE_OBJECT,
                setOf(TRUSTED_ORIGIN),
            ) { _, message, sourceOrigin, isMainFrame, _ ->
                if (!isMainFrame || sourceOrigin.toString() != TRUSTED_ORIGIN) return@addWebMessageListener
                val data = message.data ?: return@addWebMessageListener
                runCatching {
                    val json = JSONObject(data)
                    when (json.optString("command")) {
                        "bridge-ready" -> Log.i(TAG, "bridge-ready")
                        "route-applied" -> Log.i(TAG, "route-applied:${json.optString("path")}")
                        else -> {
                            SnapshotStore.writeMessage(applicationContext, data)
                            WidgetRefresh.requestAll(applicationContext)
                        }
                    }
                }.onFailure { Log.w(TAG, "Rejected widget bridge message", it) }
            }
        } else {
            Log.w(TAG, "WEB_MESSAGE_LISTENER unavailable; widget sync disabled for this WebView")
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == TRUSTED_HOST) return false
                if (uri.scheme == "volt") {
                    pendingRoute = RouteParser.fromValue(uri.toString())
                    loadBridgeAndDispatch(pendingRoute)
                    return true
                }
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                Log.i(TAG, "web-ready:$url")
                loadBridgeAndDispatch(pendingRoute)
            }
        }
    }

    private fun loadBridgeAndDispatch(route: String?) {
        if (!::webView.isInitialized) return
        val quotedRoute = route?.let(JSONObject::quote) ?: "null"
        val script = """
            (() => {
              const route = $quotedRoute;
              import('./src/volt-widget-bridge.js?v=20260813.7')
                .then(() => {
                  window.dispatchEvent(new CustomEvent('volt:widget-sync'));
                  if (route) {
                    window.dispatchEvent(new CustomEvent('volt:native-route', { detail: { path: route } }));
                  }
                })
                .catch((error) => console.warn('VOLT Android widget bridge unavailable', error));
            })();
        """.trimIndent()
        webView.evaluateJavascript(script) {
            if (route != null) {
                Log.i(TAG, "route-dispatched:$route")
                if (pendingRoute == route) pendingRoute = null
            }
        }
    }

    companion object {
        private const val TAG = "VOLTAndroid"
        private const val TRUSTED_HOST = "www.voltconsumo.com.br"
        private const val TRUSTED_ORIGIN = "https://www.voltconsumo.com.br"
        private const val WEB_URL = "$TRUSTED_ORIGIN/"
        private const val BRIDGE_OBJECT = "voltAndroidWidget"
    }
}
