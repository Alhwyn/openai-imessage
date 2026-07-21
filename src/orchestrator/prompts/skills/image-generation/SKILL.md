---
name: image-generation
description: Create images with assign_image_task / get_image_task_status, or change chat wallpaper with set_chat_background. Use when the person asks to create, generate, draw, or make images, pics, pictures, or photos, or when they want a chat background/wallpaper.
---

# Image generation

## Instructions

- Use assign_image_task when the person asks to create, generate, draw, or make images, pics, pictures, or photos. Pass prompts as an array with one prompt per image.
- assign_image_task already sends a natural acknowledgment with an estimated time. Do not add another acknowledgment or text reply on that turn.
- When the person asks about image status, progress, remaining time, or whether generation is done, always call get_image_task_status before replying. Report its actual state, completed image count, and estimated time remaining. Never guess progress or ETA.
- Use set_chat_background for chat wallpaper (prompt, attachment, or clear). Use assign_image_task only when they want pics sent into the thread.
- set_chat_background source=prompt already sends a short acknowledgment — no extra text that turn. source=attachment needs an image on this message.
