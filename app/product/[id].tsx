// Update the Edit button onPress handler in the existing file:
// Find the adminActionsContainer View and update the Edit button TouchableOpacity:

<TouchableOpacity 
  style={[styles.adminActionButton, { 
    backgroundColor: colors.lightGray, 
    borderColor: colors.border 
  }]}
  onPress={() => router.push(`/product/edit/${id}`)}
>
  <Edit size={20} color={colors.text} />
  <Text style={[styles.adminActionText, { color: colors.text }]}>Edit</Text>
</TouchableOpacity>