import flet as ft
import os
import base64
import json

import database
import engine
import config
from components import recent_runs, tower_analytics, session_analytics, height_analytics

# Upload directory for file imports (server-side)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
#test
# ===========================
# MAIN APP
# ===========================
def main(page: ft.Page):
    # 1. Page Configuration
    page.title = "MCSR Practice Tracker v1.13 (Web)"
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 10
    
    # Initialize DB & load persisted data
    database.init_db()
    database.load_from_storage(page)
    
    # Load Config
    cfg = config.load_config(page)

    # --- FILE PICKER SETUP ---
    file_picker = ft.FilePicker()
    page.overlay.append(file_picker)

    # --- UI COMPONENTS ---
    analytics_comp = tower_analytics.TowerAnalytics()
    session_comp = session_analytics.SessionAnalytics()
    height_comp = height_analytics.HeightAnalytics()
    
    # Callback for clicking a run in the Recent list
    def go_to_tower_analytics(tower_name, run_type):
        tabs.selected_index = 1
        tabs.update()
        
        current_cfg = config.load_config(page)
        mode = current_cfg.get("navigation_mode", "default")
        
        if mode == "filter":
            analytics_comp.show_detail(tower_name, initial_filter_type=run_type)
        else:
            analytics_comp.show_detail(tower_name)

    # Create the Recent Runs view
    recent_view, table_control = recent_runs.get_view(page, on_run_click=go_to_tower_analytics)

    # --- LAYOUT CONTAINERS ---
    left_panel = ft.Container(
        content=recent_view,
        width=cfg.get("left_panel_width", 630), 
        padding=10,
        bgcolor=ft.colors.GREY_900,
        border_radius=10,
        animate_size=300
    )

    # --- RIGHT PANEL WITH TABS ---
    tabs = ft.Tabs(
        selected_index=0,
        animation_duration=300,
        tabs=[
            ft.Tab(
                text="Session Analytics",
                icon=ft.icons.HISTORY,
                content=session_comp
            ),
            ft.Tab(
                text="Tower Analytics",
                icon=ft.icons.BAR_CHART,
                content=analytics_comp
            ),
            ft.Tab(
                text="Height Analytics",
                icon=ft.icons.HEIGHT,
                content=height_comp
            ),
        ],
        expand=True
    )

    right_panel = ft.Container(
        content=tabs,
        expand=True,
        padding=10,
        bgcolor=ft.colors.GREY_900,
        border_radius=10
    )

    # --- LAYOUT: RESIZABLE SPLIT ---
    def resize_handler(e: ft.DragUpdateEvent):
        new_w = left_panel.width + e.delta_x
        if 300 <= new_w <= 800:
            left_panel.width = new_w
            left_panel.update()

    def save_resize(e):
        current_cfg = config.load_config(page)
        current_cfg['left_panel_width'] = left_panel.width
        config.save_config(page, current_cfg)
        recent_runs.set_width(table_control, left_panel.width)

    divider = ft.GestureDetector(
        content=ft.Container(
            width=10, 
            content=ft.Container(bgcolor=ft.colors.GREY_800, width=1, margin=ft.margin.symmetric(horizontal=4)),
            bgcolor=ft.colors.TRANSPARENT,
            alignment=ft.alignment.center
        ),
        on_pan_update=resize_handler,
        on_pan_end=save_resize,
        mouse_cursor=ft.MouseCursor.RESIZE_LEFT_RIGHT
    )

    main_layout = ft.Row(
        controls=[left_panel, divider, right_panel],
        expand=True,
        spacing=0,
        vertical_alignment=ft.CrossAxisAlignment.STRETCH
    )

    # --- PERSISTENT WELCOME BANNER ---
    welcome_container = ft.Container(
        content=ft.Column([
            ft.Text("Welcome to Tower Practice Tracker!", size=24, weight="bold", color=ft.colors.YELLOW_400),
            ft.Text("Import your log files to see your statistics and track your progress.", size=18, color=ft.colors.WHITE),
            ft.Container(height=10),
            ft.ElevatedButton(
                "Import My Data Now", 
                icon=ft.icons.UPLOAD_FILE,
                on_click=lambda e: open_import(e),
                style=ft.ButtonStyle(
                    bgcolor=ft.colors.BLUE_700,
                    color=ft.colors.WHITE,
                    padding=ft.padding.symmetric(horizontal=30, vertical=20),
                )
            )
        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, tight=True),
        padding=ft.padding.all(30),
        bgcolor=ft.colors.BLACK,
        border_radius=15,
        visible=False,
        margin=ft.padding.only(left=20, right=20, bottom=40, top=20),
        shadow=ft.BoxShadow(blur_radius=20, color=ft.colors.with_opacity(0.3, ft.colors.BLACK))
    )

    # --- LOADING BAR ---
    loading_bar = ft.ProgressBar(width=None, color="blue", bgcolor="#222222")
    loading_container = ft.Container(
        content=loading_bar,
        height=5,
        opacity=0,
        animate_opacity=200,
    )

    def set_loading(is_loading: bool):
        loading_container.opacity = 1 if is_loading else 0
        loading_container.update()
        page.update()

    # --- STARTUP / REFRESH LOGIC ---
    def refresh_ui():
        set_loading(True)
        try:
            if hasattr(table_control, 'page') and table_control.page:
                recent_runs.update_table(table_control)
            
            if hasattr(session_comp, 'page') and session_comp.page and session_comp.view_mode == "list":
                session_comp.refresh_list()
                
            if hasattr(analytics_comp, 'page') and analytics_comp.page and analytics_comp.view_mode == "grid":
                analytics_comp.show_grid()

            if hasattr(height_comp, 'page') and height_comp.page and height_comp.view_mode == "list":
                height_comp.show_list()

        except Exception as e:
            print(f"UI Refresh Error: {e}")
        finally:
            set_loading(False)

    # ===========================
    # IMPORT DATA POPUP (dedicated, prominent)
    # ===========================
    
    # Track import state 
    _import_state = {
        "total_files": 0,
        "processed_files": 0,
        "count_before": 0,
        "status_text": None,
        "data_count_text": None,
    }

    def open_import(e):
        # Hide the persistent welcome banner if it's visible
        if welcome_container.visible:
            welcome_container.visible = False
            page.update()

        if page.snack_bar and page.snack_bar.open:
            page.snack_bar.open = False
            page.update()
            
        import_status = ft.Text("", size=14, color="yellow")
        _import_state["status_text"] = import_status

        # --- UPLOAD HANDLER (fires per-file as uploads complete) ---
        def on_upload(e: ft.FilePickerUploadEvent):
            if e.error:
                print(f"Upload error for {e.file_name}: {e.error}")
                return
            
            if e.progress < 1.0:
                # Still uploading
                pct = int(e.progress * 100)
                import_status.value = f"Uploading {e.file_name}... {pct}%"
                page.update()
                return
            
            # Upload complete (progress == 1.0) — process the file
            _import_state["processed_files"] += 1
            current = _import_state["processed_files"]
            total = _import_state["total_files"]
            
            import_status.value = f"Processing: {current}/{total} — {e.file_name}"
            page.update()
            
            try:
                upload_path = os.path.join(UPLOAD_DIR, e.file_name)
                with open(upload_path, "rb") as fh:
                    content = fh.read()
                engine.process_file_content(e.file_name, content)
                # Clean up uploaded file
                try:
                    os.remove(upload_path)
                except:
                    pass
            except Exception as ex:
                print(f"Error processing {e.file_name}: {ex}")
            
            # Check if all files are done
            if current >= total:
                database.save_to_storage(page)
                count_after = database.get_row_count()
                new_runs = count_after - _import_state["count_before"]
                import_status.value = f"✅ Done! {new_runs} new run(s) added. ({count_after} total)"
                if _import_state["data_count_text"]:
                    _import_state["data_count_text"].value = f"Currently storing {count_after} runs in browser."
                set_loading(False)
                refresh_ui()
        
        file_picker.on_upload = on_upload

        # --- FILE PICK HANDLER ---
        def on_files_picked(e: ft.FilePickerResultEvent):
            if e.files is None or len(e.files) == 0:
                return
            
            set_loading(True)
            _import_state["total_files"] = len(e.files)
            _import_state["processed_files"] = 0
            _import_state["count_before"] = database.get_row_count()
            
            import_status.value = f"Uploading {len(e.files)} file(s)..."
            page.update()
            
            # Build upload list with pre-signed URLs
            upload_list = []
            for f in e.files:
                upload_list.append(
                    ft.FilePickerUploadFile(
                        f.name,
                        upload_url=page.get_upload_url(f.name, 600),
                    )
                )
            
            # Trigger upload
            file_picker.upload(upload_list)
        
        file_picker.on_result = on_files_picked
        
        def pick_log_files(e):
            file_picker.pick_files(
                allow_multiple=True,
                allowed_extensions=["gz", "log"],
                dialog_title="Select your .log.gz files (Ctrl+A to select all)"
            )

        # --- EXPORT HANDLER ---
        def export_data(e):
            try:
                json_data = database.export_json()
                # Revert to launch_url for compatibility, using a direct Data URI
                b64 = base64.b64encode(json_data.encode("utf-8")).decode("utf-8")
                # Using short filename and application/octet-stream for better browser behavior
                page.launch_url(f"data:application/json;base64,{b64}")
                import_status.value = "✅ Backup generated! Download should start shortly."
            except Exception as ex:
                import_status.value = f"Export error: {ex}"
            page.update()

        # on_export_complete is no longer used for downloads

        def import_backup(e):
            # This triggers file picker for the JSON backup
            file_picker.on_result = on_backup_picked
            file_picker.pick_files(
                allow_multiple=False,
                allowed_extensions=["json"],
                dialog_title="Select backup JSON file"
            )

        def on_backup_picked(e: ft.FilePickerResultEvent):
            if e.files and len(e.files) > 0:
                try:
                    # In web, we must use the upload flow to read file content
                    _import_state["total_files"] = 1
                    _import_state["processed_files"] = 0
                    _import_state["count_before"] = database.get_row_count()
                    
                    # Temporarily change on_upload to handle JSON
                    def on_json_upload(ue: ft.FilePickerUploadEvent):
                        if ue.progress == 1.0:
                            try:
                                upload_path = os.path.join(UPLOAD_DIR, ue.file_name)
                                with open(upload_path, "r", encoding="utf-8") as fh:
                                    content = fh.read()
                                count = database.import_json(content)
                                database.save_to_storage(page)
                                import_status.value = f"✅ Backup restored! {count} runs imported."
                                refresh_ui()
                                # Clean up
                                os.remove(upload_path)
                            except Exception as ex:
                                import_status.value = f"Backup error: {ex}"
                            page.update()
                            # Restore original upload handler
                            file_picker.on_upload = on_upload
                    
                    file_picker.on_upload = on_json_upload
                    file_picker.upload([ft.FilePickerUploadFile(
                        e.files[0].name,
                        upload_url=page.get_upload_url(e.files[0].name, 600)
                    )])
                except Exception as ex:
                    import_status.value = f"Error: {ex}"
                    page.update()
            # Restore picker result handler
            file_picker.on_result = on_files_picked
            if not (e.files and len(e.files) > 0):
                pass # Already handled by setting on_result

        # --- CLEAR DATA HANDLER ---
        def clear_data(e):
            def confirm_clear(ce):
                database.clear_db()
                database.save_to_storage(page)
                import_status.value = "All data cleared."
                refresh_ui()
                page.close(dlg_confirm)
                page.update()

            dlg_confirm = ft.AlertDialog(
                title=ft.Text("Clear All Data?"),
                content=ft.Text("This will permanently delete all runs stored in this browser session. This action cannot be undone."),
                actions=[
                    ft.TextButton("Cancel", on_click=lambda _: page.close(dlg_confirm)),
                    ft.ElevatedButton("Clear Everything", bgcolor=ft.colors.RED_700, color=ft.colors.WHITE, on_click=confirm_clear)
                ]
            )
            page.open(dlg_confirm)

        # Path hints
        def copy_path(e):
            path = e.control.data
            page.set_clipboard(path)
            page.snack_bar = ft.SnackBar(ft.Text(f"Copied to clipboard: {path}"), duration=2000)
            page.snack_bar.open = True
            page.update()

        path_hints = ft.Column([
            ft.Text("📁 Common log folder locations (Click to Copy):", 
                     size=14, weight="bold"),
            ft.Container(height=3),
        ] + [
            ft.Container(
                content=ft.Row([
                    ft.Icon(ft.icons.CONTENT_COPY, size=16, color=ft.colors.BLUE_200),
                    ft.Text(p, size=13, color=ft.colors.BLUE_200, selectable=False),
                ], spacing=10),
                bgcolor=ft.colors.with_opacity(0.1, ft.colors.BLUE_200),
                padding=ft.padding.symmetric(horizontal=12, vertical=10),
                border_radius=8,
                ink=True,
                data=p,
                on_click=copy_path,
                on_hover=lambda e: setattr(e.control, 'bgcolor', ft.colors.with_opacity(0.2, ft.colors.BLUE_200) if e.data == "true" else ft.colors.with_opacity(0.1, ft.colors.BLUE_200)) or e.control.update()
            ) for p in config.COMMON_LOG_PATHS
        ], spacing=8)

        # Status indicators
        import_btn = ft.ElevatedButton(
            "Select Log Files (.gz / .log)", 
            icon=ft.icons.FOLDER_OPEN,
            on_click=pick_log_files,
            style=ft.ButtonStyle(
                bgcolor=ft.colors.BLUE_700,
                color=ft.colors.WHITE,
                padding=ft.padding.symmetric(horizontal=20, vertical=15),
            )
        )

        export_btn = ft.OutlinedButton("Export Data", icon=ft.icons.DOWNLOAD, on_click=export_data)
        backup_btn = ft.OutlinedButton("Import Backup", icon=ft.icons.RESTORE, on_click=import_backup)
        clear_btn = ft.TextButton("Clear All Data", icon=ft.icons.DELETE_FOREVER, 
                                  style=ft.ButtonStyle(color=ft.colors.RED_400),
                                  on_click=clear_data)

        dlg_import = ft.AlertDialog(
            title=ft.Text("Import Data", size=22, weight="bold"),
            content=ft.Column([
                ft.Text("Import your Minecraft log files to track your runs.", size=18),
                ft.Text("Select all files in your logs folder. Duplicates are skipped automatically.", 
                         size=15, color="grey"),
                ft.Container(height=5),
                path_hints,
                ft.Container(height=15),
                ft.Text("(Tip: Press Ctrl+A inside the folder to select all files at once)", 
                         size=14, color=ft.colors.BLUE_200, italic=True),
                import_btn,
                import_status,
                ft.Divider(),
                # ft.Text("Data Management", weight="bold", size=13),
                # ft.Row([export_btn, backup_btn], spacing=10),
                clear_btn,
            ], width=600, scroll=ft.ScrollMode.ADAPTIVE, tight=True),
            actions=[
                ft.TextButton("Close", on_click=lambda e: page.close(dlg_import)),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        page.dialog = dlg_import
        dlg_import.open = True
        page.update()

    # ===========================
    # CREDITS POPUP
    # ===========================
    def open_credits(e):
        credits_content = ft.Column([
            ft.Container(height=10),
            ft.Row([
                ft.Text("Made for & Advised by ", size=16),
                ft.Text("SolandMoon", size=16, weight="bold", tooltip="Sol and Moon")
            ], alignment=ft.MainAxisAlignment.CENTER),
            ft.Container(height=5),
            ft.Text(
                spans=[
                    ft.TextSpan("Made by "),
                    ft.TextSpan(
                        "iyo", 
                        url="https://x.com/spacefaringiyo", 
                        style=ft.TextStyle(color=ft.colors.BLUE_400, decoration=ft.TextDecoration.UNDERLINE)
                    ),
                    ft.TextSpan(" & "),
                    ft.TextSpan(
                        "Gemini", 
                        url="https://aistudio.google.com", 
                        style=ft.TextStyle(color=ft.colors.BLUE_400, decoration=ft.TextDecoration.UNDERLINE)
                    ),
                ],
                size=16,
            ),
            ft.Container(height=10),
            ft.Text("v1.13.0 (Web)", size=12, color="grey")
        ], tight=True, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

        dlg_credits = ft.AlertDialog(
            title=ft.Text("Credits", text_align=ft.TextAlign.CENTER),
            content=credits_content,
            actions=[
                ft.TextButton("Close", on_click=lambda e: page.close(dlg_credits))
            ],
            actions_alignment=ft.MainAxisAlignment.CENTER,
        )
        page.dialog = dlg_credits
        dlg_credits.open = True
        page.update()

    # ===========================
    # SETTINGS POPUP (appearance & behavior only)
    # ===========================
    def open_settings(e):
        current_cfg = config.load_config(page)
        
        def save_settings(e):
            new_cfg = {
                "left_panel_width": width_slider.value,
                "navigation_mode": nav_radio.value,
            }
            config.save_config(page, new_cfg)
            dlg_modal.open = False
            page.snack_bar = ft.SnackBar(ft.Text("Settings saved!"))
            page.snack_bar.open = True
            page.update()
        
        def on_width_change(e):
            left_panel.width = e.control.value
            left_panel.update()

        width_slider = ft.Slider(
            min=300, max=800, divisions=50, 
            value=left_panel.width, 
            label="{value}px",
            on_change=on_width_change
        )
        
        nav_radio = ft.RadioGroup(
            value=current_cfg.get("navigation_mode", "default"),
            content=ft.Column([
                ft.Radio(value="default", label="Show All Types (Default)"),
                ft.Radio(value="filter", label="Filter by Clicked Type"),
            ])
        )

        dlg_modal = ft.AlertDialog(
            modal=True,
            title=ft.Text("Settings"),
            content=ft.Column([
                ft.Text("Appearance", weight="bold"),
                ft.Text("Left Panel Width:"),
                width_slider,
                ft.Divider(),
                ft.Text("Behavior", weight="bold"),
                nav_radio,
            ], height=300, width=450, scroll=ft.ScrollMode.ADAPTIVE),
            actions=[
                ft.TextButton("Save & Close", on_click=save_settings),
                ft.TextButton("Cancel", on_click=lambda e: page.close(dlg_modal)),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        page.dialog = dlg_modal
        dlg_modal.open = True
        page.update()

    # --- HEADER ---
    header = ft.Row(
        controls=[
            ft.Text("Tower Practice Tracker", size=20, weight="bold"),
            ft.Row([
                ft.ElevatedButton(
                    "Import Data",
                    icon=ft.icons.UPLOAD_FILE,
                    on_click=open_import,
                    style=ft.ButtonStyle(
                        bgcolor=ft.colors.BLUE_700,
                        color=ft.colors.WHITE,
                    )
                ),
                ft.IconButton(ft.icons.INFO_OUTLINE, tooltip="Credits", on_click=open_credits),
                ft.IconButton(ft.icons.SETTINGS, tooltip="Settings", on_click=open_settings)
            ], spacing=5)
        ],
        alignment=ft.MainAxisAlignment.SPACE_BETWEEN
    )

    # --- FINAL PAGE ASSEMBLY ---
    page.add(
        header, 
        loading_container, 
        ft.Column([main_layout, welcome_container], expand=True, spacing=0)
    )
    
    # Initialize width for scaling
    recent_runs.set_width(table_control, left_panel.width)
    
    page.update() # Final build sync before data refresh

    # --- STARTUP MESSAGE ---
    row_count = database.get_row_count()
    if row_count == 0:
        welcome_container.visible = True
        page.update()

    refresh_ui()

if __name__ == "__main__":
    # Use environment variable for secret key (provided by local env or GitHub Secrets)
    os.environ["FLET_SECRET_KEY"] = os.getenv("FLET_SECRET_KEY", "mcsr-tracker-default-fallback")
    
    # Run the app. Note: 'port' is only used for local dev/testing.
    # In a WASM/Static build, the hosting environment manages the connection.
    ft.app(target=main, view=ft.AppView.WEB_BROWSER, upload_dir=UPLOAD_DIR)
