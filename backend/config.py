from datetime import datetime, timedelta

DB_CONFIG = {
    'driver': '{ODBC Driver 17 for SQL Server}',
    'server': 'mokrani',  # Remplacez par le nom de votre serveur SQL Server
    'database': 'MISFAT',
    'trusted_connection': 'yes',  # Authentification Windows
   
}

EMAIL_CONFIG = {
    'sender_email': 'mahamokrani7@gmail.com',
    'sender_password': 'sdcrojblkjvrkazt',
    'receiver_email': 'amenibouchemi0123@gmail.com'
}

MACHINE_COLUMNS = ["G19", "G26", "MISFAT_3_Compresseur_3", "MISFAT_3_G39f", 
                  "MISFAT_3_D18f", "MISFAT_3_G10f", "MISFAT_3_TGBT_N3f"]