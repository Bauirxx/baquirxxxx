package com.screenporter.companion.ui

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.screenporter.companion.R

/**
 * RecyclerView adapter for the permissions list in MainActivity.
 * Each row shows: status icon (granted/missing) + title + description + grant button.
 */
data class PermissionItem(
    val id: String,
    val title: String,
    val description: String,
    val granted: Boolean,
    val actionType: ActionType
)

enum class ActionType {
    ACCESSIBILITY,
    BATTERY,
    NOTIFICATION,
    LOCATION,
    CALLS,
    SMS,
    APP_USAGE,
    NOTIF_LISTENER,
    OVERLAY,
    BROWSER
}

class PermissionItemAdapter(
    private val context: Context,
    private val onGrantClick: (PermissionItem) -> Unit,
    private val onPermissionChanged: () -> Unit
) : RecyclerView.Adapter<PermissionItemAdapter.ViewHolder>() {

    private val items = mutableListOf<PermissionItem>()

    fun submitList(newItems: List<PermissionItem>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(context).inflate(R.layout.item_permission, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val imgStatus: ImageView = itemView.findViewById(R.id.imagePermissionStatus)
        private val txtTitle: TextView = itemView.findViewById(R.id.textPermissionTitle)
        private val txtDesc: TextView = itemView.findViewById(R.id.textPermissionDesc)
        private val btnGrant: Button = itemView.findViewById(R.id.btnGrantPermission)

        fun bind(item: PermissionItem) {
            txtTitle.text = item.title
            txtDesc.text = item.description
            if (item.granted) {
                imgStatus.setImageResource(R.drawable.ic_check)
                imgStatus.setBackgroundResource(R.drawable.bg_status_ok)
                btnGrant.visibility = View.GONE
                btnGrant.text = context.getString(R.string.permission_granted)
            } else {
                imgStatus.setImageResource(R.drawable.ic_warning)
                imgStatus.setBackgroundResource(R.drawable.bg_status_warning)
                btnGrant.visibility = View.VISIBLE
                btnGrant.text = context.getString(R.string.permission_action_grant)
            }
            btnGrant.setOnClickListener { onGrantClick(item) }
        }
    }
}
