package com.screenporter.companion.network

// Plain data classes — no kotlinx.serialization needed (we use org.json directly in ApiClient).

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val user: UserInfo
)

data class UserInfo(
    val id: String,
    val email: String,
    val name: String
)

// WebSocket messages — sent/received as text frames (JSON strings).
sealed class WsMessage {
    abstract val t: String

    // Outbound: hello on connect
    data class Hello(
        override val t: String = "hello",
        val id: String,
        val model: String,
        val width: Int,
        val height: Int,
        val osVersion: String,
        val agentVersion: String
    ) : WsMessage()

    // Outbound: location update
    data class Location(
        override val t: String = "location",
        val lat: Double,
        val lon: Double,
        val acc: Float,
        val ts: Long
    ) : WsMessage()

    // Outbound: heartbeat
    data class Heartbeat(
        override val t: String = "heartbeat",
        val ts: Long
    ) : WsMessage()

    // Outbound: status update (capture mode change)
    data class Status(
        override val t: String = "status",
        val mode: String,
        val connected: Boolean
    ) : WsMessage()

    // Inbound: control commands
    data class Control(
        val command: String,
        val x: Float? = null,
        val y: Float? = null,
        val duration: Long? = null,
        val text: String? = null,
        val key: Int? = null
    )
}
