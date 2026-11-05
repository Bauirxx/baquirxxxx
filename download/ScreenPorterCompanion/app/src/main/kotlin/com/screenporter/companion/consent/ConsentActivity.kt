package com.screenporter.companion.consent

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.screenporter.companion.MainActivity
import com.screenporter.companion.R
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Consent Wizard — multi-jurisdição (LGPD / GDPR / COPPA).
 *
 * Steps:
 *  1. Show the 3 jurisdiction options + select one
 *  2. Show the relevant legal text (snippet) for the selected jurisdiction
 *  3. 3 checkboxes: parent/legal guardian declaration, commitment to inform device holder,
 *     and acceptance of Terms + Privacy Policy
 *  4. Save local consent record (audit) + send to server via /api/agent/ingest
 *
 * The consent record contains:
 *  - jurisdiction (BR / EU / US)
 *  - legalVersion (e.g. "tos-1.0-lgpd")
 *  - timestamp
 *  - device info (model, osVersion)
 *
 * Transparency: the user can REVOKE consent at any time from MainActivity (settings),
 * which clears the local record and notifies the server.
 */
class ConsentActivity : AppCompatActivity() {

    companion object {
        const val TAG = "SP-Consent"
        const val EXTRA_JURISDICTION = "jurisdiction"
        const val EXTRA_FROM_DEEP_LINK = "from_deep_link"

        // Legal versions per jurisdiction
        val LEGAL_VERSIONS = mapOf(
            "BR" to "tos-1.0-lgpd",
            "EU" to "tos-1.0-gdpr",
            "US" to "tos-1.0-coppa"
        )

        // Legal text snippets (PT-BR + EN)
        val LEGAL_SNIPPETS = mapOf(
            "BR" to mapOf(
                "pt-BR" to "Nos termos da Lei nº 13.709/2018 (LGPD), você declara que (i) é pai, mãe ou responsável legal do menor cujo dispositivo será monitorado; (ii) possui o consentimento para tratar os dados pessoais da criança/adolescente (art. 14, LGPD); (iii) informará o titular do dispositivo sobre a existência do monitoramento. O titular poderá exercer os direitos previstos no art. 18 da LGPD.",
                "en" to "Pursuant to Law No. 13.709/2018 (LGPD), you declare that (i) you are the parent or legal guardian of the minor whose device will be monitored; (ii) you are authorized to process the child/adolescent's personal data (Art. 14); (iii) you will inform the device holder about the monitoring. The holder may exercise the rights set forth in Art. 18."
            ),
            "EU" to mapOf(
                "pt-BR" to "Nos termos do Regulamento (UE) 2016/679 (GDPR), você declara que (i) é titular do poder de representação legal do menor (art. 8º); (ii) possui base legal para o tratamento (art. 6º); (iii) informará o titular dos dados sobre o monitoramento. Os direitos dos arts. 15–22 são garantidos, incluindo o direito ao esquecimento (art. 17). Foi realizada Avaliação de Impacto à Proteção de Dados (DPIA — art. 35).",
                "en" to "Under Regulation (EU) 2016/679 (GDPR), you declare that (i) you hold parental responsibility for the minor (Art. 8); (ii) you have a lawful basis for processing (Art. 6); (iii) you will inform the data subject about the monitoring. The rights under Arts. 15–22 are guaranteed, including the right to erasure (Art. 17). A Data Protection Impact Assessment (DPIA — Art. 35) has been performed."
            ),
            "US" to mapOf(
                "pt-BR" to "Nos termos da Children's Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506), você declara que (i) é pai, mãe ou guardião legal da criança menor de 13 anos; (ii) fornece consentimento verificável para coleta, uso e divulgação de informações pessoais (§ 6505); (iii) pode solicitar revisão e exclusão dos dados a qualquer momento (§ 6505(h)). Leis estaduais aplicáveis (CCPA/CPRA na Califórnia, etc.) são observadas.",
                "en" to "Under the Children's Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506), you declare that (i) you are the parent or legal guardian of the child under 13; (ii) you provide verifiable consent for collection, use, and disclosure of personal information (§ 6505); (iii) you may request review and deletion of the data at any time (§ 6505(h)). Applicable state laws (CCPA/CPRA in California, etc.) are observed."
            )
        )
    }

    private lateinit var prefs: PreferencesManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var selectedJurisdiction: String = "BR"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = (application as ScreenPorterApp).prefs

        // Use the jurisdiction from intent (deep link) if provided
        intent.getStringExtra(EXTRA_JURISDICTION)?.let {
            if (it in LEGAL_VERSIONS) selectedJurisdiction = it
        }

        setContentView(buildUI())
        supportActionBar?.title = getString(R.string.consent_title)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
    }

    private fun buildUI(): View {
        val ctx = this
        val container = ScrollView(ctx)
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        // Step 1: Jurisdiction selection
        root.addView(TextView(ctx).apply {
            text = getString(R.string.consent_step_jurisdiction)
            textSize = 18f
            setPadding(0, 24, 0, 16)
        })
        val radioGroup = RadioGroup(ctx)
        listOf("BR" to "Brasil — LGPD", "EU" to "União Europeia — GDPR", "US" to "EUA — COPPA").forEach { (code, label) ->
            val rb = RadioButton(ctx).apply {
                text = label
                id = View.generateViewId()
                tag = code
                isChecked = code == selectedJurisdiction
            }
            radioGroup.addView(rb)
        }
        radioGroup.setOnCheckedChangeListener { _, checkedId ->
            val rb = radioGroup.findViewById<RadioButton>(checkedId)
            selectedJurisdiction = rb.tag as String
            // Refresh the legal text below
            root.findViewById<TextView>(1001).text = LEGAL_SNIPPETS[selectedJurisdiction]?.get("pt-BR")
        }
        root.addView(radioGroup)

        // Step 2: Legal text snippet
        root.addView(TextView(ctx).apply {
            text = getString(R.string.consent_legal_text)
            textSize = 14f
            setTextColor(0xFF6B6B6B.toInt())
            setPadding(0, 32, 0, 8)
        })
        root.addView(TextView(ctx).apply {
            id = 1001
            text = LEGAL_SNIPPETS[selectedJurisdiction]?.get("pt-BR")
            textSize = 13f
            setPadding(24, 24, 24, 24)
            background = android.graphics.drawable.ColorDrawable(0x10000000)
        })

        // Step 3: 3 checkboxes
        root.addView(TextView(ctx).apply {
            text = getString(R.string.consent_step_accept)
            textSize = 18f
            setPadding(0, 32, 0, 16)
        })
        val cbParent = CheckBox(ctx).apply { text = getString(R.string.consent_cb_parent) }
        val cbInform = CheckBox(ctx).apply { text = getString(R.string.consent_cb_inform) }
        val cbTerms = CheckBox(ctx).apply { text = getString(R.string.consent_cb_terms) }
        root.addView(cbParent)
        root.addView(cbInform)
        root.addView(cbTerms)

        // Warning
        root.addView(TextView(ctx).apply {
            text = getString(R.string.consent_warning)
            textSize = 12f
            setTextColor(0xFFF59E0B.toInt())
            setPadding(0, 16, 0, 16)
        })

        // Buttons
        val btnSign = Button(ctx).apply {
            text = getString(R.string.consent_button_sign)
            setBackgroundColor(0xFFFF6B35.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                if (!cbParent.isChecked || !cbInform.isChecked || !cbTerms.isChecked) {
                    AlertDialog.Builder(ctx)
                        .setTitle(getString(R.string.app_name))
                        .setMessage(getString(R.string.consent_all_required))
                        .setPositiveButton(android.R.string.ok, null)
                        .show()
                    return@setOnClickListener
                }
                saveAndContinue()
            }
        }
        root.addView(btnSign)

        container.addView(root)
        return container
    }

    private fun saveAndContinue() {
        // Save consent locally
        val now = System.currentTimeMillis()
        prefs.consentSigned = true
        prefs.consentJurisdiction = selectedJurisdiction
        prefs.consentSignedAt = now
        prefs.consentLegalVersion = LEGAL_VERSIONS[selectedJurisdiction] ?: ""

        // Send consent record to the server via /api/agent/ingest
        scope.launch {
            val api = ApiClient(prefs)
            val event = mapOf(
                "type" to "consent",
                "payload" to mapOf(
                    "consentType" to "parent",
                    "jurisdiction" to selectedJurisdiction,
                    "legalVersion" to (LEGAL_VERSIONS[selectedJurisdiction] ?: ""),
                    "signedAt" to now,
                    "deviceModel" to android.os.Build.MODEL,
                    "osVersion" to "Android ${android.os.Build.VERSION.RELEASE}",
                    "deviceId" to prefs.deviceId
                )
            )
            withContext(Dispatchers.IO) { api.ingest(listOf(event)) }

            // Return to MainActivity
            val main = Intent(this@ConsentActivity, MainActivity::class.java)
            if (intent.getBooleanExtra(EXTRA_FROM_DEEP_LINK, false)) {
                main.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(main)
            finish()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
