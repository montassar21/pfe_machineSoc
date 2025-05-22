from datetime import datetime, timedelta

DB_CONFIG = {
    'driver': '{ODBC Driver 17 for SQL Server}',
    'server': "mokrani",
    'database': 'MISFAT',
    'trusted_connection': 'yes',  # Authentification Windows
   
}

EMAIL_CONFIG = {
    'sender_email': 'mahamokrani7@gmail.com',
    'sender_password': 'sdcrojblkjvrkazt',
    'receiver_email': 'amenibouchemi0123@gmail.com'
}

MACHINE_COLUMNS =  [
    'G19', 'G26', 'Compresseur_3', 'G39', 
    'D18', 'G10', 'TGBT_3'
]
