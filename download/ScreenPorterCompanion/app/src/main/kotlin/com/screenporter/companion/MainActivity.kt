package com.screenporter.companion

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.screenporter.companion.consent.ConsentActivity
import com.screenporter.companion.install.DeepLinkHandler
import com.screenporter.companion.install.QrScannerActivity
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.sos.SosOverlayService
import com.screenporter.companion.ui.ActionType
import com.screenporter.companion.ui.PermissionItem
import com.screenporter.companion.ui.PermissionItemAdapter
import com.screenporter.companion.util.PermissionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    companion object {
        const val TAG = "SP-Main"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var prefs: com.screenporter.companion.util.PreferencesManager
    private lateinit var api: ApiClient
    private lateinit var adapter: PermissionItemAdapter

    private lateinit var editServerAddress: EditText
    private lateinit var editServerUser: EditText
    private lateinit var editServerPassword: EditText
    private lateinit var btnToggleConnect: Button
    private lateinit var btnScanQr: Button
    private lateinit var btnSosToggle: Button
    private lateinit var btnOpenConsent: Button
    private lateinit var textStatus: TextView
    private lateinit var textMode: TextView
    private lateinit var textStep1Status: TextView
    private lateinit var textVersion: TextView

    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            startCaptureService(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, R.string.toast_missing_permissions, Toast.LENGTH_SHORT).show()
        }
    }

    private val permissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> refreshPermissions() }

    private val settingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { _ -> refreshPermissions() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = (application as ScreenPorterApp).prefs
        api = ApiClient(prefs)

        bindViews()
        setupRecycler()
        loadServerConfig()
        setupClickListeners()

        // Handle deep link if launched via screenporter://setup?...
        handleDeepLink(intent)

        // Show consent wizard automatically if not signed and setup is complete (deep link)
        if (prefs.setupCompleted && !prefs.consentSigned) {
            btnOpenConsent.performClick()
        }
    }

    private fun bindViews() {
        editServerAddress = findViewById(R.id.editServerAddress)
        editServerUser = findViewById(R.id.editServerUser)
        editServerPassword = findViewById(R.id.editServerPassword)
        btnToggleConnect = findViewById(R.id.btnToggleConnect)
        btnScanQr = findViewById(R.id.btnScanQr)
        btnSosToggle = findViewById(R.id.btnSosToggle)
        btnOpenConsent = findViewById(R.id.btnOpenConsent)
        textStatus = findViewById(R.id.textStatus)
        textMode = findViewById(R.id.textMode)
        textStep1Status = findViewById(R.id.textStep1Status)
        textVersion = findViewById(R.id.textVersion)

        val versionName = packageManager.getPackageInfo(packageName, 0).versionName ?: "0.0"
        textVersion.text = getString(R.string.footer_version, versionName)
    }

    private fun setupRecycler() {
        val recycler = findViewById<RecyclerView>(R.id.recyclerPermissions)
        adapter = PermissionItemAdapter(this, ::onPermissionGrant, ::refreshPermissions)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter
    }

    private fun loadServerConfig() {
        editServerAddress.setText(prefs.serverAddress)
        editServerUser.setText(prefs.serverUser)
        editServerPassword.setText(prefs.serverPassword)
    }

    private fun setupClickListeners() {
        findViewById<Button>(R.id.btnSaveServer).setOnClickListener { saveServer() }
        findViewById<Button>(R.id.btnEnableProtection).setOnClickListener { explainProtection() }
        btnToggleConnect.setOnClickListener { onConnectClick() }
        btnScanQr.setOnClickListener {
            // Camera permission first
            if (!PermissionState.isCameraGranted(this)) {
                permissionsLauncher.launch(arrayOf(Manifest.permission.CAMERA))
                return@setOnClickListener
            }
            startActivity(Intent(this, QrScannerActivity::class.java))
        }
        btnOpenConsent.setOnClickListener {
            val i = Intent(this, ConsentActivity::class.java).apply {
                putExtra(ConsentActivity.EXTRA_JURISDICTION, prefs.consentJurisdiction.ifEmpty { "BR" })
            }
            startActivity(i)
        }
        btnSosToggle.setOnClickListener {
            val enable = !prefs.sosOverlayEnabled
            prefs.sosOverlayEnabled = enable
            if (enable) {
                if (!PermissionState.canDrawOverlays(this)) {
                    Toast.makeText(this, R.string.toast_overlay_permission, Toast.LENGTH_LONG).show()
                    settingsLauncher.launch(PermissionState.overlaySettingsIntent(this))
                    return@setOnClickListener
                }
                val i = Intent(this, SosOverlayService::class.java).apply {
                    action = SosOverlayService.ACTION_SHOW
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(i)
                } else {
                    startService(i)
                }
                btnSosToggle.text = getString(R.string.sos_disable)
            } else {
                val i = Intent(this, SosOverlayService::class.java).apply {
                    action = SosOverlayService.ACTION_HIDE
                }
                startService(i)
                btnSosToggle.text = getString(R.string.sos_enable)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    override fun onResume() {
        super.onResume()
        refreshPermissions()
        updateConnectionUI(prefs.isConnected)
        btnSosToggle.text = if (prefs.sosOverlayEnabled)
            getString(R.string.sos_disable) else getString(R.string.sos_enable)
    }

    private fun handleDeepLink(intent: Intent) {
        if (intent.action == Intent.ACTION_VIEW && intent.data != null) {
            val applied = DeepLinkHandler.handle(intent, prefs)
            if (applied) {
                loadServerConfig()
                DeepLinkHandler.routeAfterSetup(this, prefs, prefs.consentJurisdiction.ifEmpty { "BR" })
            } else {
                Toast.makeText(this, R.string.qr_invalid, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun saveServer() {
        val addr = editServerAddress.text.toString().trim()
        val user = editServerUser.text.toString().trim()
        val pass = editServerPassword.text.toString()
        if (addr.isEmpty() || user.isEmpty() || pass.isEmpty()) {
            Toast.makeText(this, R.string.toast_missing_permissions, Toast.LENGTH_SHORT).show()
            return
        }
        prefs.serverAddress = addr
        prefs.serverUser = user
        prefs.serverPassword = pass

        scope.launch {
            val ok = withContext(Dispatchers.IO) { api.login() }
            if (ok) {
                Toast.makeText(this@MainActivity, R.string.toast_login_ok, Toast.LENGTH_SHORT).show()
                textStep1Status.text = getString(R.string.permission_granted)
                textStep1Status.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.status_success))
            } else {
                Toast.makeText(this@MainActivity, R.string.toast_login_fail, Toast.LENGTH_LONG).show()
                textStep1Status.text = getString(R.string.permission_missing)
                textStep1Status.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.status_warning))
            }
        }
    }

    private fun refreshPermissions() {
        val items = listOf(
            PermissionItem("accessibility",
                getString(R.string.permission_accessibility),
                getString(R.string.permission_accessibility_desc),
                PermissionState.isAccessibilityEnabled(this), ActionType.ACCESSIBILITY),
            PermissionItem("battery",
                getString(R.string.permission_battery),
                getString(R.string.permission_battery_desc),
                PermissionState.isBatteryOptimizationIgnored(this), ActionType.BATTERY),
            PermissionItem("notifications",
                getString(R.string.permission_notifications),
                getString(R.string.permission_notifications_desc),
                PermissionState.isNotificationGranted(this), ActionType.NOTIFICATION),
            PermissionItem("location",
                getString(R.string.permission_location),
                getString(R.string.permission_location_desc),
                PermissionState.isLocationGranted(this), ActionType.LOCATION),
            PermissionItem("calls",
                getString(R.string.permission_calls),
                getString(R.string.permission_calls_desc),
                PermissionState.isCallLogGranted(this), ActionType.CALLS),
            PermissionItem("sms",
                getString(R.string.permission_sms),
                getString(R.string.permission_sms_desc),
                PermissionState.isSmsGranted(this), ActionType.SMS),
            PermissionItem("app_usage",
                getString(R.string.permission_app_usage),
                getString(R.string.permission_app_usage_desc),
                PermissionState.isUsageStatsGranted(this), ActionType.APP_USAGE),
            PermissionItem("notif_listener",
                getString(R.string.permission_notif_listener),
                getString(R.string.permission_notif_listener_desc),
                PermissionState.isNotificationListenerEnabled(this), ActionType.NOTIF_LISTENER),
            PermissionItem("overlay",
                getString(R.string.permission_overlay),
                getString(R.string.permission_overlay_desc),
                PermissionState.canDrawOverlays(this), ActionType.OVERLAY),
            PermissionItem("browser",
                getString(R.string.permission_browser),
                getString(R.string.permission_browser_desc),
                PermissionState.isBrowserHistoryGranted(this), ActionType.BROWSER)
        )
        adapter.submitList(items)
    }

    private fun onPermissionGrant(item: PermissionItem) {
        when (item.actionType) {
            ActionType.ACCESSIBILITY -> settingsLauncher.launch(PermissionState.accessibilitySettingsIntent())
            ActionType.BATTERY -> {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:$packageName"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    settingsLauncher.launch(intent)
                } catch (e: Exception) {
                    settingsLauncher.launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            ActionType.NOTIFICATION -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    permissionsLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                } else {
                    settingsLauncher.launch(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            ActionType.LOCATION -> permissionsLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ))
            ActionType.CALLS -> permissionsLauncher.launch(arrayOf(
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.READ_PHONE_STATE
            ))
            ActionType.SMS -> permissionsLauncher.launch(arrayOf(
                Manifest.permission.READ_SMS,
                Manifest.permission.RECEIVE_SMS
            ))
            ActionType.APP_USAGE -> settingsLauncher.launch(PermissionState.usageStatsSettingsIntent())
            ActionType.NOTIF_LISTENER -> settingsLauncher.launch(PermissionState.notificationListenerSettingsIntent())
            ActionType.OVERLAY -> settingsLauncher.launch(PermissionState.overlaySettingsIntent(this))
            ActionType.BROWSER -> permissionsLauncher.launch(arrayOf(
                "android.permission.READ_HISTORY_BOOKMARKS",
                "com.android.browser.permission.READ_HISTORY_BOOKMARKS"
            ))
        }
    }

    private fun onConnectClick() {
        if (prefs.isConnected) {
            val svc = Intent(this, CaptureService::class.java).apply { action = CaptureService.ACTION_STOP }
            startService(svc)
            updateConnectionUI(false)
        } else {
            if (!PermissionState.isAccessibilityEnabled(this)) {
                Toast.makeText(this, R.string.toast_missing_permissions, Toast.LENGTH_LONG).show()
                return
            }
            if (!prefs.consentSigned) {
                Toast.makeText(this, R.string.consent_required, Toast.LENGTH_LONG).show()
                startActivity(Intent(this, ConsentActivity::class.java))
                return
            }
            if (prefs.authToken.isNullOrEmpty()) {
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { api.login() }
                    if (!ok) {
                        Toast.makeText(this@MainActivity, R.string.toast_login_fail, Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    requestMediaProjection()
                }
            } else {
                requestMediaProjection()
            }
        }
    }

    private fun requestMediaProjection() {
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        mediaProjectionLauncher.launch(mpm.createScreenCaptureIntent())
    }

    private fun startCaptureService(resultCode: Int, data: Intent) {
        val svc = Intent(this, CaptureService::class.java).apply {
            action = CaptureService.ACTION_START
            putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(CaptureService.EXTRA_RESULT_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc)
        } else {
            startService(svc)
        }
        updateConnectionUI(true)
    }

    private fun updateConnectionUI(connected: Boolean) {
        if (connected) {
            btnToggleConnect.text = getString(R.string.disconnect_button)
            textStatus.text = getString(R.string.status_connected)
            textMode.text = when (CaptureService.currentMode) {
                CaptureService.CaptureMode.VIDEO -> getString(R.string.mode_video)
                CaptureService.CaptureMode.SCREEN -> getString(R.string.mode_screen)
                CaptureService.CaptureMode.CONTROL -> getString(R.string.mode_control)
                CaptureService.CaptureMode.NONE -> getString(R.string.mode_unknown)
            }
        } else {
            btnToggleConnect.text = getString(R.string.connect_button)
            textStatus.text = getString(R.string.status_disconnected)
            textMode.text = getString(R.string.mode_unknown)
        }
    }

    private fun explainProtection() {
        AlertDialog.Builder(this)
            .setTitle(R.string.step_protection_title)
            .setMessage(getString(R.string.protection_instructions))
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }
}
